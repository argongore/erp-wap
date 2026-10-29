import React, { useState, useMemo, useEffect } from 'react';
import {
  Wheat,
  HandCoins,
  CheckCircle2,
  AlertCircle,
  Receipt,
  Printer,
  Search,
  Wallet,
  UserCheck,
  Pencil,
  ArrowRight,
} from 'lucide-react';
import {
  Mitra,
  Rekening,
  TransaksiKasbonUang,
  TransaksiPembelianBarang,
  TransaksiPembelianHasilBumi,
  TransaksiPencairanTitipan,
  TransaksiPenjualan,
  TransaksiPenjualanHasilBumi,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat, getWIBTodayString } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { ModalPinjamUangMitra } from '../common/ModalPinjamUangMitra.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';

interface Props {
  mitraList: Mitra[];
  rekeningList: Rekening[];
  pembelianList: TransaksiPembelianHasilBumi[];
  pembelianBarangList?: TransaksiPembelianBarang[];
  penjualanList?: TransaksiPenjualan[];
  penjualanHasilBumiList?: TransaksiPenjualanHasilBumi[];
  kasbonUangList?: TransaksiKasbonUang[];
  initialSelectedMitraId?: string;
  onNavigateToBayarBon?: (idMitra: string) => void;
  onRefresh: () => void;
  onPrintReceipt?: (receipt: ReceiptData) => void;
  onOpenKliringSilang?: (idMitra: string) => void;
}

export const BayarTitipanHasilBumiView: React.FC<Props> = ({
  mitraList,
  rekeningList,
  pembelianList,
  pembelianBarangList = [],
  penjualanList = [],
  penjualanHasilBumiList = [],
  kasbonUangList = [],
  initialSelectedMitraId,
  onNavigateToBayarBon,
  onRefresh,
  onPrintReceipt,
}) => {
  const [selectedMitraId, setSelectedMitraId] = useState<string>(initialSelectedMitraId || '');
  const [nominalInput, setNominalInput] = useState<string>('');
  const [rekeningSumber, setRekeningSumber] = useState<string>('KAS01');
  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER'>('TUNAI');
  const [keterangan, setKeterangan] = useState<string>('');
  const [tanggalInput, setTanggalInput] = useState<string>(getWIBTodayString());

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [pinjamUangModalOpen, setPinjamUangModalOpen] = useState<boolean>(false);

  const [pencairanList, setPencairanList] = useState<TransaksiPencairanTitipan[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [editTxId, setEditTxId] = useState<string | null>(null);

  // Sync external navigation target if provided
  useEffect(() => {
    if (initialSelectedMitraId) {
      setSelectedMitraId(initialSelectedMitraId);
    }
  }, [initialSelectedMitraId]);

  // Load history of disbursements
  const loadHistory = async (silent = false) => {
    if (!silent && pencairanList.length === 0) setLoadingHistory(true);
    try {
      const list = await api.getPencairanTitipan();
      setPencairanList(list);
    } catch (err: any) {
      console.warn('Gagal memuat riwayat pencairan titipan:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory(false);
    const onErpUpdated = () => loadHistory(true);
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, []);

  // Compute titipan & active bon balances for each partner (with automatic cross-deduction)
  const partnerPositionMap = useMemo(() => {
    const map = new Map<
      string,
      {
        totalTitipKotor: number;
        totalDicairkan: number;
        saldoTitipAktif: number;
        saldoBonAktif: number;
        potongBonOtomatis: number;
        saldoSiapBayarBersih: number;
        sisaBonMitraBersih: number;
      }
    >();

    const ensureEntry = (idMitra: string) => {
      let cur = map.get(idMitra);
      if (!cur) {
        cur = {
          totalTitipKotor: 0,
          totalDicairkan: 0,
          saldoTitipAktif: 0,
          saldoBonAktif: 0,
          potongBonOtomatis: 0,
          saldoSiapBayarBersih: 0,
          sisaBonMitraBersih: 0,
        };
        map.set(idMitra, cur);
      }
      return cur;
    };

    // 1. Add titip hasil bumi & pinjaman dana
    for (const p of pembelianList) {
      if (p.metodePembayaran === 'TITIP' && p.idMitra) {
        const cur = ensureEntry(p.idMitra);
        cur.totalTitipKotor += p.totalNominal;
      }
    }

    // 2. Add unpaid supplier HUTANG purchases (Kulakan Tempo)
    for (const pb of pembelianBarangList) {
      if (pb.metodePembayaran === 'HUTANG' && pb.status !== 'LUNAS' && pb.idMitra) {
        const cur = ensureEntry(pb.idMitra);
        cur.totalTitipKotor += pb.totalNominal;
      }
    }

    // 3. Deduct historical disbursements (including KOMPENSASI_BON)
    for (const pt of pencairanList) {
      if (pt.idMitra) {
        const cur = ensureEntry(pt.idMitra);
        cur.totalDicairkan += pt.nominalPencairan;
      }
    }

    // 4. Add all active Bon Mitra (Penjualan Toko KASBON + Penjualan Hasil Bumi PIUTANG + Kasbon Uang)
    for (const pj of penjualanList) {
      if (
        pj.idMitra &&
        pj.metode === 'KASBON' &&
        pj.statusPembayaran === 'BELUM_BAYAR' &&
        pj.sisaPiutang > 0
      ) {
        const cur = ensureEntry(pj.idMitra);
        cur.saldoBonAktif += pj.sisaPiutang;
      }
    }

    for (const jhb of penjualanHasilBumiList) {
      if (
        jhb.idMitra &&
        jhb.metodePembayaran === 'PIUTANG' &&
        jhb.statusPembayaran === 'BELUM_BAYAR' &&
        jhb.sisaPiutang > 0
      ) {
        const cur = ensureEntry(jhb.idMitra);
        cur.saldoBonAktif += jhb.sisaPiutang;
      }
    }

    for (const kb of kasbonUangList) {
      if (kb.idMitra && kb.status !== 'LUNAS' && kb.sisaKasbon > 0) {
        const cur = ensureEntry(kb.idMitra);
        cur.saldoBonAktif += kb.sisaKasbon;
      }
    }

    // 5. Finalize net cross-deduction per partner
    map.forEach((cur) => {
      cur.saldoTitipAktif = Math.max(0, cur.totalTitipKotor - cur.totalDicairkan);
      cur.potongBonOtomatis = Math.min(cur.saldoTitipAktif, cur.saldoBonAktif);
      cur.saldoSiapBayarBersih = Math.max(0, cur.saldoTitipAktif - cur.saldoBonAktif);
      cur.sisaBonMitraBersih = Math.max(0, cur.saldoBonAktif - cur.saldoTitipAktif);
    });

    return map;
  }, [
    pembelianList,
    pembelianBarangList,
    pencairanList,
    penjualanList,
    penjualanHasilBumiList,
    kasbonUangList,
  ]);

  // List of partners relevant to Titipan (prioritize those with net payable > 0)
  const activeTitipPartners = useMemo(() => {
    return mitraList
      .map((m) => {
        const pos = partnerPositionMap.get(m.id) || {
          totalTitipKotor: 0,
          totalDicairkan: 0,
          saldoTitipAktif: 0,
          saldoBonAktif: 0,
          potongBonOtomatis: 0,
          saldoSiapBayarBersih: 0,
          sisaBonMitraBersih: 0,
        };
        return {
          ...m,
          ...pos,
        };
      })
      .filter((m) => m.saldoTitipAktif > 0 || m.id === selectedMitraId)
      .sort((a, b) => {
        if (b.saldoSiapBayarBersih !== a.saldoSiapBayarBersih) {
          return b.saldoSiapBayarBersih - a.saldoSiapBayarBersih;
        }
        return b.saldoTitipAktif - a.saldoTitipAktif;
      });
  }, [mitraList, partnerPositionMap, selectedMitraId]);

  // Totals across all partners
  const { grandTotalSiapBayarBersih, grandTotalPotongBon, readyPartnerCount } = useMemo(() => {
    let netSum = 0;
    let potongSum = 0;
    let count = 0;
    partnerPositionMap.forEach((v) => {
      netSum += v.saldoSiapBayarBersih;
      potongSum += v.potongBonOtomatis;
      if (v.saldoSiapBayarBersih > 0) count += 1;
    });
    return {
      grandTotalSiapBayarBersih: netSum,
      grandTotalPotongBon: potongSum,
      readyPartnerCount: count,
    };
  }, [partnerPositionMap]);

  const selectedMitra = useMemo(
    () => mitraList.find((m) => m.id === selectedMitraId),
    [mitraList, selectedMitraId]
  );

  const selectedPos = useMemo(() => {
    if (!selectedMitraId) return null;
    return (
      partnerPositionMap.get(selectedMitraId) || {
        totalTitipKotor: 0,
        totalDicairkan: 0,
        saldoTitipAktif: 0,
        saldoBonAktif: 0,
        potongBonOtomatis: 0,
        saldoSiapBayarBersih: 0,
        sisaBonMitraBersih: 0,
      }
    );
  }, [selectedMitraId, partnerPositionMap]);

  const selectedMitraTitipanKotor = selectedPos?.saldoTitipAktif || 0;
  const selectedMitraBonAktif = selectedPos?.saldoBonAktif || 0;
  const selectedPotongBonOtomatis = selectedPos?.potongBonOtomatis || 0;
  // Nominal bersih maksimal yang wajib dibayar PT ke Mitra setelah potong bon otomatis
  const selectedMitraSiapBayarBersih = selectedPos?.saldoSiapBayarBersih || 0;
  const selectedSisaBonMitraBersih = selectedPos?.sisaBonMitraBersih || 0;

  // Auto-fill nominal input to net payable whenever partner changes
  useEffect(() => {
    if (!selectedMitraId) {
      setNominalInput('');
      return;
    }
    if (selectedMitraSiapBayarBersih > 0) {
      setNominalInput(String(selectedMitraSiapBayarBersih));
    } else {
      setNominalInput('0');
    }
  }, [selectedMitraId, selectedMitraSiapBayarBersih]);

  const selectedRekening = useMemo(
    () => rekeningList.find((r) => r.kode === rekeningSumber),
    [rekeningList, rekeningSumber]
  );

  const handleQuickPercent = (pct: number) => {
    if (selectedMitraSiapBayarBersih <= 0) return;
    const amount = Math.round((selectedMitraSiapBayarBersih * pct) / 100);
    setNominalInput(String(amount));
  };

  const executePayment = async (nominalToPay: number) => {
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedMitraId) {
      setErrorMsg('Pilih mitra yang akan dibayarkan dana titipannya.');
      return;
    }

    const isImpasZeroCash =
      nominalToPay === 0 && selectedPotongBonOtomatis > 0 && selectedMitraSiapBayarBersih === 0;

    if (!isImpasZeroCash && (!nominalToPay || nominalToPay <= 0)) {
      setErrorMsg('Nominal pembayaran dari PT ke mitra harus lebih dari Rp 0.');
      return;
    }

    if (nominalToPay > selectedMitraSiapBayarBersih) {
      setErrorMsg(
        `Nominal melebihi sisa wajib bayar bersih PT ke mitra (${formatRupiah(
          selectedMitraSiapBayarBersih
        )}).`
      );
      return;
    }

    const isRekAnakPerusahaan = Boolean(
      selectedRekening &&
        (selectedRekening.isAnakPerusahaan ||
          selectedRekening.kategori === 'ANAK_PERUSAHAAN' ||
          selectedRekening.kode === 'REK-DPPARABO')
    );

    if (
      nominalToPay > 0 &&
      selectedRekening &&
      !isRekAnakPerusahaan &&
      selectedRekening.saldoSaatIni < nominalToPay
    ) {
      setErrorMsg(
        `Saldo kas/bank ${selectedRekening.nama} tidak mencukupi (Tersedia: ${formatRupiah(
          selectedRekening.saldoSaatIni
        )}).`
      );
      return;
    }

    setSubmitting(true);
    try {
      const record = await api.cairkanTitipan({
        idMitra: selectedMitraId,
        nominal: nominalToPay,
        rekeningSumber,
        metode,
        keterangan: keterangan.trim() || undefined,
        tanggal: tanggalInput,
      });

      if (isImpasZeroCash) {
        setSuccessMsg(
          `Tutup buku impas otomatis berhasil! Titipan & Bon ${selectedMitra?.nama} sebesar ${formatRupiah(
            selectedPotongBonOtomatis
          )} telah ditutup lunas tanpa uang keluar.`
        );
      } else if (selectedPotongBonOtomatis > 0) {
        setSuccessMsg(
          `Berhasil! Bon ${selectedMitra?.nama} (${formatRupiah(
            selectedPotongBonOtomatis
          )}) otomatis lunas terpotong & sisa bersih ${formatRupiah(nominalToPay)} telah dibayarkan ke mitra!`
        );
      } else {
        setSuccessMsg(
          `Pembayaran dari PT ke ${selectedMitra?.nama} sebesar ${formatRupiah(nominalToPay)} berhasil diproses!`
        );
      }

      setKeterangan('');
      onRefresh();
      await loadHistory();

      if (onPrintReceipt && selectedMitra && nominalToPay > 0) {
        const potongBon = record.nominalPotongBonOtomatis || selectedPotongBonOtomatis;
        const titipAwalKotor = record.totalTitipanAwalKotor || selectedMitraTitipanKotor;

        const detailRows: ReceiptData['detailRows'] = [
          { label: 'Nomor Transaksi', value: record.idPencairan },
          { label: 'Penerima / Mitra', value: `${selectedMitra.nama} (${selectedMitra.kode})` },
          {
            label: 'Metode Pembayaran PT',
            value: `${metode} via ${selectedRekening?.nama || rekeningSumber}`,
          },
        ];

        if (potongBon > 0) {
          detailRows.push({
            label: 'Total Titipan Hasil Bumi',
            value: formatRupiah(titipAwalKotor),
          });
          detailRows.push({
            label: 'Dipotong Otomatis Bon Mitra',
            value: `- ${formatRupiah(potongBon)}`,
          });
          detailRows.push({
            label: 'Hak Bersih Mitra',
            value: formatRupiah(record.saldoTitipanSebelum),
          });
        } else {
          detailRows.push({
            label: 'Saldo Titipan Sebelum',
            value: formatRupiah(record.saldoTitipanSebelum),
          });
        }

        detailRows.push({
          label: 'Dibayarkan PT ke Mitra',
          value: formatRupiah(nominalToPay),
          isTotal: true,
          highlight: true,
        });
        detailRows.push({
          label: 'Sisa Saldo Titipan',
          value: formatRupiah(record.saldoTitipanSisa),
        });

        onPrintReceipt({
          title: 'BUKTI PEMBAYARAN PT KE MITRA (TITIPAN HASIL BUMI)',
          subtitle: potongBon > 0 ? 'TERMASUK POTONG BON OTOMATIS' : 'PT WIJAYA AGRO PERKASA',
          nomorTransaksi: record.idPencairan,
          nomorNota: record.idPencairan,
          tanggal: record.tanggal,
          jam: record.jam,
          kasir: 'KasirWap',
          kategori: 'PEMBAYARAN PT KE MITRA',
          mitra: selectedMitra.nama,
          namaMitra: selectedMitra.nama,
          roleMitra: selectedMitra.role,
          rekening: selectedRekening?.nama || rekeningSumber,
          detailRows,
          items: [
            {
              nama:
                potongBon > 0
                  ? `Pembayaran Bersih Titipan Hasil Bumi (Setelah Potong Bon ${formatRupiah(potongBon)})`
                  : 'Pembayaran Titipan Pembelian Hasil Bumi',
              qty: 1,
              satuan: 'Trx',
              harga: nominalToPay,
              subtotal: nominalToPay,
            },
          ],
          total: nominalToPay,
          terbilang: `${formatRupiah(nominalToPay)}`,
          catatan:
            potongBon > 0
              ? `Bon Mitra ${formatRupiah(potongBon)} telah lunas dipotong otomatis. Sisa Titipan: ${formatRupiah(
                  record.saldoTitipanSisa
                )}`
              : `Sisa Saldo Titipan Mitra: ${formatRupiah(record.saldoTitipanSisa)}`,
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses pembayaran dari PT ke mitra');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executePayment(Number(nominalInput) || 0);
  };

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return pencairanList;
    const q = searchQuery.toLowerCase();
    return pencairanList.filter(
      (p) =>
        p.namaMitra.toLowerCase().includes(q) ||
        p.idPencairan.toLowerCase().includes(q) ||
        (p.keterangan || '').toLowerCase().includes(q)
    );
  }, [pencairanList, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
              Pembayaran dari PT ke Mitra (Titipan Hasil Bumi)
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
              POTONG BON OTOMATIS
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Pembayaran hak bersih titipan hasil bumi dari PT ke mitra — apabila mitra memiliki bon, bon otomatis dipotong terlebih dahulu tanpa perlu kliring manual.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() => setPinjamUangModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            title="Catat penerimaan pinjaman uang dari mitra ke PT (otomatis menambah saldo titip mitra)"
          >
            <HandCoins className="w-3.5 h-3.5 text-emerald-200" />
            <span>+ Pinjam Uang PT ke Mitra</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onRefresh();
              loadHistory();
            }}
            className="text-xs font-medium px-3 py-1.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-700 shadow-2xs cursor-pointer"
          >
            Muat Ulang Data
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 text-xs text-amber-800 font-semibold mb-1 min-w-0">
            <span className="truncate">SIAP BAYAR BERSIH PT KE MITRA</span>
            <Wheat className="w-4 h-4 text-amber-600 shrink-0" />
          </div>
          <div
            className="text-2xl font-black text-amber-950 font-mono tabular-nums truncate whitespace-nowrap"
            title={formatRupiah(grandTotalSiapBayarBersih)}
          >
            {formatRupiahSingkat(grandTotalSiapBayarBersih)}
          </div>
          <div className="text-[11px] text-amber-700 mt-1 truncate">
            {grandTotalPotongBon > 0
              ? `Sudah dikurangi bon otomatis ${formatRupiahSingkat(grandTotalPotongBon)}`
              : 'Kewajiban bersih kas PT kepada mitra'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 text-xs text-emerald-800 font-semibold mb-1 min-w-0">
            <span className="truncate">KAS KASIR BERSIH TERSEDIA</span>
            <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <div
            className="text-2xl font-black text-emerald-950 font-mono tabular-nums truncate whitespace-nowrap"
            title={formatRupiah(rekeningList.find((r) => r.kode === 'KAS01')?.saldoSaatIni || 0)}
          >
            {formatRupiahSingkat(rekeningList.find((r) => r.kode === 'KAS01')?.saldoSaatIni || 0)}
          </div>
          <div className="text-[11px] text-emerald-700 mt-1 truncate">
            Siap untuk pembayaran tunai di kasir
          </div>
        </div>

        <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 text-xs text-indigo-800 font-semibold mb-1 min-w-0">
            <span className="truncate">MITRA SIAP TERIMA PEMBAYARAN</span>
            <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          </div>
          <div className="text-2xl font-black text-indigo-950 font-mono tabular-nums truncate whitespace-nowrap">
            {readyPartnerCount} Mitra
          </div>
          <div className="text-[11px] text-indigo-700 mt-1 truncate">
            Memiliki sisa hak bersih setelah potong bon
          </div>
        </div>
      </div>

      {/* Main Grid: Form Left, Table Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Form Pembayaran PT ke Mitra */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-zinc-200 p-5 shadow-2xs space-y-4">
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <HandCoins className="w-4 h-4 text-amber-600" />
              <span>Formulir Pembayaran dari PT ke Mitra</span>
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Bon mitra otomatis dipotong dari titipan hasil bumi, kasir tinggal membayar sisanya
            </p>
          </div>

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Pilih Mitra */}
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Pilih Mitra Penerima Pembayaran <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={selectedMitraId}
                onChange={(e) => setSelectedMitraId(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-amber-500 text-zinc-800 font-semibold"
              >
                <option value="">-- Pilih Mitra --</option>
                {activeTitipPartners.map((m) => {
                  let labelSaldo = `Siap Bayar: ${formatRupiah(m.saldoSiapBayarBersih)}`;
                  if (m.saldoSiapBayarBersih > 0 && m.potongBonOtomatis > 0) {
                    labelSaldo = `Siap Bayar Bersih: ${formatRupiah(
                      m.saldoSiapBayarBersih
                    )} (Titip ${formatRupiahSingkat(m.saldoTitipAktif)} - Bon ${formatRupiahSingkat(
                      m.potongBonOtomatis
                    )})`;
                  } else if (m.saldoSiapBayarBersih === 0 && m.saldoTitipAktif > 0) {
                    labelSaldo =
                      m.sisaBonMitraBersih > 0
                        ? `Rp 0 (Habis Potong Bon — Sisa Bon Mitra ${formatRupiahSingkat(
                            m.sisaBonMitraBersih
                          )})`
                        : `Rp 0 (Impas dengan Bon ${formatRupiahSingkat(m.potongBonOtomatis)})`;
                  }
                  return (
                    <option key={m.id} value={m.id}>
                      {m.nama} — {labelSaldo}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Rincian Otomatis Titipan vs Potong Bon */}
            {selectedMitra && (
              <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-950">
                    Rincian Hak Bersih {selectedMitra.nama}
                  </span>
                  {selectedMitraSiapBayarBersih > 0 && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQuickPercent(100)}
                        className="px-2.5 py-1 text-[10px] font-bold bg-amber-700 text-white rounded hover:bg-amber-800 transition-colors cursor-pointer"
                      >
                        100% LUNAS
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickPercent(50)}
                        className="px-2 py-1 text-[10px] font-bold bg-white text-amber-800 border border-amber-300 rounded hover:bg-amber-100 transition-colors cursor-pointer"
                      >
                        50%
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-white border border-amber-200/90 space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between text-zinc-600">
                    <span className="font-sans">Total Titipan Hasil Bumi:</span>
                    <span className="font-semibold text-zinc-900">
                      {formatRupiah(selectedMitraTitipanKotor)}
                    </span>
                  </div>

                  {selectedPotongBonOtomatis > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span className="font-sans font-medium">
                        Otomatis Dipotong Bon Mitra:
                      </span>
                      <span className="font-bold">- {formatRupiah(selectedPotongBonOtomatis)}</span>
                    </div>
                  )}

                  <div className="flex justify-between pt-1.5 border-t border-zinc-200 text-amber-950">
                    <span className="font-sans font-bold">
                      Sisa Wajib Bayar PT ke Mitra:
                    </span>
                    <span className="font-extrabold text-sm">
                      {formatRupiah(selectedMitraSiapBayarBersih)}
                    </span>
                  </div>
                </div>

                {selectedPotongBonOtomatis > 0 && selectedMitraSiapBayarBersih > 0 && (
                  <div className="flex items-start space-x-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      Saat Anda klik <strong>Bayar ke Mitra Sekarang</strong>, bon mitra sebesar{' '}
                      <strong className="font-mono">{formatRupiah(selectedPotongBonOtomatis)}</strong>{' '}
                      otomatis ditutup lunas dan kas PT hanya keluar sebesar{' '}
                      <strong className="font-mono">{formatRupiah(Number(nominalInput) || 0)}</strong>.
                    </span>
                  </div>
                )}

                {/* Jika Impas 100% (Titipan == Bon) */}
                {selectedPotongBonOtomatis > 0 &&
                  selectedMitraSiapBayarBersih === 0 &&
                  selectedSisaBonMitraBersih === 0 && (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 space-y-2">
                      <div className="text-[11px] text-emerald-900">
                        Titipan Hasil Bumi dan Bon {selectedMitra.nama} <strong>impas persis (Rp 0)</strong>. Tidak ada uang kas keluar maupun masuk.
                      </div>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => executePayment(0)}
                        className="w-full py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg transition-colors cursor-pointer"
                      >
                        {submitting
                          ? 'Memproses...'
                          : `Tutup Buku Lunas Impas (Rp 0 Tanpa Uang Keluar)`}
                      </button>
                    </div>
                  )}

                {/* Jika Bon Mitra ternyata lebih besar dari Titipan (PT tidak bayar, justru Mitra masih kurang bayar bon) */}
                {selectedSisaBonMitraBersih > 0 && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 space-y-2">
                    <div className="text-[11px] text-rose-900">
                      Titipan Hasil Bumi ({formatRupiah(selectedMitraTitipanKotor)}) sudah habis memotong Bon ({formatRupiah(selectedMitraBonAktif)}). PT tidak membayar uang ke mitra — justru mitra masih memiliki sisa bon bersih{' '}
                      <strong className="font-mono">{formatRupiah(selectedSisaBonMitraBersih)}</strong>.
                    </div>
                    {onNavigateToBayarBon && (
                      <button
                        type="button"
                        onClick={() => onNavigateToBayarBon(selectedMitra.id)}
                        className="w-full py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <span>
                          Ke Pelunasan Sisa Bon Mitra ({formatRupiah(selectedSisaBonMitraBersih)})
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Nominal Pembayaran PT ke Mitra */}
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Nominal Dibayar PT ke Mitra (Rp) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 font-bold text-zinc-400">Rp</span>
                <input
                  type="number"
                  required
                  min={0}
                  max={selectedMitraSiapBayarBersih || undefined}
                  disabled={!selectedMitraId || selectedMitraSiapBayarBersih <= 0}
                  value={nominalInput}
                  onChange={(e) => setNominalInput(e.target.value)}
                  placeholder="0"
                  className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono font-bold text-sm text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-400"
                />
              </div>
              {Number(nominalInput) > 0 && (
                <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                  Dibayarkan bersih dari kas/bank PT: {formatRupiah(Number(nominalInput))}
                </div>
              )}
            </div>

            {/* Sumber Dana & Metode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Sumber Kas / Bank PT</label>
                <select
                  value={rekeningSumber}
                  onChange={(e) => setRekeningSumber(e.target.value)}
                  disabled={selectedMitraSiapBayarBersih <= 0}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-amber-500 text-zinc-800 disabled:bg-zinc-100"
                >
                  {rekeningList
                    .filter((r) => !r.isVirtual && r.status === 'AKTIF')
                    .map((r) => (
                      <option key={r.kode} value={r.kode}>
                        {r.nama} ({formatRupiah(r.saldoSaatIni)})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Metode Bayar</label>
                <select
                  value={metode}
                  onChange={(e) => setMetode(e.target.value as 'TUNAI' | 'TRANSFER')}
                  disabled={selectedMitraSiapBayarBersih <= 0}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-amber-500 text-zinc-800 disabled:bg-zinc-100"
                >
                  <option value="TUNAI">TUNAI (Kas Kasir)</option>
                  <option value="TRANSFER">TRANSFER BANK</option>
                </select>
              </div>
            </div>

            {/* Tanggal & Keterangan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Tanggal Bayar</label>
                <input
                  type="text"
                  value={tanggalInput}
                  onChange={(e) => setTanggalInput(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-amber-500 text-zinc-800 font-mono"
                  placeholder="DD/MM/YYYY"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Catatan / Keterangan</label>
                <input
                  type="text"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder="Cth: Pelunasan sisa panen setelah potong bon"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-amber-500 text-zinc-800"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={
                submitting ||
                !selectedMitraId ||
                selectedMitraSiapBayarBersih <= 0 ||
                Number(nominalInput) <= 0 ||
                Number(nominalInput) > selectedMitraSiapBayarBersih
              }
              className="w-full py-2.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:cursor-not-allowed mt-2"
            >
              <HandCoins className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Memproses Pembayaran...'
                  : selectedMitraSiapBayarBersih > 0
                  ? `Bayar ke Mitra Sekarang (${formatRupiah(Number(nominalInput) || 0)})`
                  : 'Tidak Ada Sisa Pembayaran PT ke Mitra (Rp 0)'}
              </span>
            </button>
          </form>
        </div>

        {/* Right Table: Riwayat Pembayaran Titipan */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-zinc-200 p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-zinc-700" />
                <span>Riwayat Pembayaran PT ke Mitra (Titipan Hasil Bumi)</span>
              </h2>
              <p className="text-[11px] text-zinc-500">
                Histori pembayaran bersih ke mitra &amp; potongan bon otomatis
              </p>
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Cari mitra / nomor bukti..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-200 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">TANGGAL</th>
                  <th className="py-2.5 px-3">NO. BUKTI</th>
                  <th className="py-2.5 px-3">NAMA MITRA</th>
                  <th className="py-2.5 px-3 text-right">NOMINAL</th>
                  <th className="py-2.5 px-3 text-right">SISA TITIPAN</th>
                  <th className="py-2.5 px-3">SUMBER / METODE</th>
                  <th className="py-2.5 px-3 text-center">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-800">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-400">
                      {loadingHistory ? 'Memuat riwayat...' : 'Belum ada transaksi pembayaran titipan'}
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((pt) => {
                    const isPotongBon =
                      pt.metodePembayaran === 'SINKRON' ||
                      pt.metodePembayaran === 'KOMPENSASI_BON' ||
                      pt.rekeningSumber === 'SINKRON' ||
                      Boolean(pt.isKompensasiBon);
                    return (
                      <tr key={pt.idPencairan} className="hover:bg-zinc-50/80 transition-colors">
                        <td className="py-2.5 px-3 whitespace-nowrap text-zinc-600 font-mono">
                          <div>{pt.tanggal}</div>
                          <div className="text-[10px] text-zinc-400">{pt.jam}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-zinc-900 whitespace-nowrap">
                          {pt.idPencairan}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-zinc-900">
                          <div>{pt.namaMitra}</div>
                          {(pt.nominalPotongBonOtomatis || 0) > 0 && (
                            <div className="text-[10px] text-cyan-800 font-medium">
                              Sinkron potong bon {formatRupiahSingkat(pt.nominalPotongBonOtomatis || 0)}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-800 whitespace-nowrap">
                          {formatRupiah(pt.nominalPencairan)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-zinc-600 whitespace-nowrap">
                          {formatRupiah(pt.saldoTitipanSisa)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              isPotongBon
                                ? 'bg-cyan-50 text-cyan-900 border border-cyan-200'
                                : 'bg-zinc-100 text-zinc-700'
                            }`}
                          >
                            {isPotongBon
                              ? 'SINKRON POTONG BON'
                              : `${pt.rekeningSumber} (${pt.metodePembayaran})`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditTxId(pt.idPencairan)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-900 text-zinc-700 hover:text-white border border-zinc-200 text-[10px] font-semibold transition-colors cursor-pointer"
                              title="Edit nominal pencairan atau rekening"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            {onPrintReceipt && (
                              <button
                                type="button"
                                onClick={() =>
                                  onPrintReceipt({
                                    title: 'BUKTI PEMBAYARAN PT KE MITRA (TITIPAN HASIL BUMI)',
                                    subtitle: 'PT WIJAYA AGRO PERKASA',
                                    nomorTransaksi: pt.idPencairan,
                                    nomorNota: pt.idPencairan,
                                    tanggal: pt.tanggal,
                                    jam: pt.jam,
                                    kasir: 'KasirWap',
                                    kategori: 'PEMBAYARAN PT KE MITRA',
                                    mitra: pt.namaMitra,
                                    namaMitra: pt.namaMitra,
                                    roleMitra: 'MITRA_TANI',
                                    rekening: pt.rekeningSumber,
                                    detailRows: [
                                      { label: 'Nomor Transaksi', value: pt.idPencairan },
                                      { label: 'Mitra Penerima', value: pt.namaMitra },
                                      ...(pt.nominalPotongBonOtomatis
                                        ? [
                                            {
                                              label: 'Total Titipan Awal',
                                              value: formatRupiah(
                                                pt.totalTitipanAwalKotor ||
                                                  pt.saldoTitipanSebelum + pt.nominalPotongBonOtomatis
                                              ),
                                            },
                                            {
                                              label: 'Potong Bon Otomatis',
                                              value: `- ${formatRupiah(pt.nominalPotongBonOtomatis)}`,
                                            },
                                          ]
                                        : []),
                                      {
                                        label: 'Metode Bayar',
                                        value: `${pt.metodePembayaran} (${pt.rekeningSumber})`,
                                      },
                                      {
                                        label: 'Nominal Dibayarkan PT',
                                        value: formatRupiah(pt.nominalPencairan),
                                        isTotal: true,
                                        highlight: true,
                                      },
                                      {
                                        label: 'Sisa Titipan',
                                        value: formatRupiah(pt.saldoTitipanSisa),
                                      },
                                    ],
                                    items: [
                                      {
                                        nama: 'Pembayaran Titipan Hasil Bumi dari PT ke Mitra',
                                        qty: 1,
                                        satuan: 'Trx',
                                        harga: pt.nominalPencairan,
                                        subtotal: pt.nominalPencairan,
                                      },
                                    ],
                                    total: pt.nominalPencairan,
                                    terbilang: `${formatRupiah(pt.nominalPencairan)}`,
                                    catatan: `Sisa Saldo Titipan Mitra: ${formatRupiah(
                                      pt.saldoTitipanSisa
                                    )}`,
                                  })
                                }
                                className="p-1.5 text-zinc-600 hover:text-amber-800 hover:bg-amber-50 rounded transition-colors cursor-pointer"
                                title="Cetak Kuitansi Pembayaran"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
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
      </div>

      {/* Modal Pinjam Uang dari PT ke Mitra (Masuk Saldo Titip) */}
      <ModalPinjamUangMitra
        isOpen={pinjamUangModalOpen}
        onClose={() => setPinjamUangModalOpen(false)}
        mitraList={mitraList}
        rekeningList={rekeningList}
        onSuccess={(result) => {
          setSuccessMsg(
            `Pinjaman uang sebesar ${formatRupiah(result.nominal)} dari ${result.mitraNama} berhasil dicatat & masuk ke Saldo Titip Mitra!`
          );
          onRefresh();
          loadHistory();
        }}
      />

      {/* Modal Universal Edit Detail Pencairan Titipan */}
      <ModalEditTransaksiUniversal
        isOpen={Boolean(editTxId)}
        transactionId={editTxId}
        jenisHint="PENCAIRAN_TITIPAN"
        onClose={() => setEditTxId(null)}
        onSuccess={() => {
          onRefresh();
          loadHistory();
        }}
      />
    </div>
  );
};
