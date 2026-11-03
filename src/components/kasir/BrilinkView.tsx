import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  Printer,
  Trash2,
  Search,
  UserPlus,
  CreditCard,
  Pencil,
  Wallet,
  Building2,
} from 'lucide-react';
import {
  JenisTransaksiBrilink,
  Mitra,
  Rekening,
  TransaksiBrilink,
  isTanpaDivisi,
} from '../../server/types.ts';
import { api } from '../../api/client.ts';
import {
  formatRupiah,
  formatRupiahSingkat,
  parseRupiahInput,
} from '../../utils/format.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { ImageUploadZone } from '../common/ImageUploadZone.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';
import {
  ArusKasDivisiSelectorCard,
  DoubleCheckVerifikasiPanel,
  isRealTransferBankAccount,
  useDivisiOptions,
} from '../common/DoubleCheckVerifikasiPanel.tsx';

interface Props {
  rekeningList: Rekening[];
  mitraList: Mitra[];
  brilinkList: TransaksiBrilink[];
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
}

function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const QUICK_ADMIN_AMOUNTS = [3000, 5000, 10000, 15000, 20000, 25000, 50000];
const QUICK_POKOK_AMOUNTS = [100000, 200000, 500000, 1000000, 2000000, 5000000];

type ModeInputBrilink = 'TARIK_TUNAI_PENUH' | 'ADM_MASUK_SAJA' | 'TUKAR_CASH';

export const BrilinkView: React.FC<Props> = ({
  rekeningList,
  mitraList,
  brilinkList,
  onSuccess,
  onRefresh,
}) => {
  const divisiOptions = useDivisiOptions();
  const bankAccounts = useMemo(
    () => rekeningList.filter(isRealTransferBankAccount),
    [rekeningList]
  );
  const defaultBriAccount = useMemo(
    () =>
      bankAccounts.find((r) => r.kode.toUpperCase() === 'BRI01') ||
      bankAccounts.find((r) => /bri/i.test(r.kode) || /bri/i.test(r.nama)) ||
      bankAccounts[0],
    [bankAccounts]
  );
  const kas01Acc = useMemo(
    () => rekeningList.find((r) => r.kode === 'KAS01'),
    [rekeningList]
  );
  const activeMitra = useMemo(
    () => mitraList.filter((m) => m.status === 'AKTIF'),
    [mitraList]
  );

  const [modeInput, setModeInput] = useState<ModeInputBrilink>('TARIK_TUNAI_PENUH');
  const [jenisBrilink, setJenisBrilink] = useState<JenisTransaksiBrilink>('TARIK_TUNAI');
  const [tanggal, setTanggal] = useState<string>(getTodayIsoDate());

  const [modePelanggan, setModePelanggan] = useState<'UMUM' | 'MITRA'>('UMUM');
  const [namaPelangganManual, setNamaPelangganManual] = useState<string>('');
  const [idMitra, setIdMitra] = useState<string>(activeMitra[0]?.id || '');
  const [showQuickAddMitra, setShowQuickAddMitra] = useState<boolean>(false);
  const [newMitraNama, setNewMitraNama] = useState<string>('');
  const [newMitraTelepon, setNewMitraTelepon] = useState<string>('');
  const [savingMitra, setSavingMitra] = useState<boolean>(false);

  const [nominalAdminDisplay, setNominalAdminDisplay] = useState<string>('');
  const [metodeAdmin, setMetodeAdmin] = useState<'TUNAI' | 'TRANSFER'>('TUNAI');
  const [rekeningAdminBank, setRekeningAdminBank] = useState<string>(
    defaultBriAccount?.kode || bankAccounts[0]?.kode || ''
  );

  const [catatMutasiPokok, setCatatMutasiPokok] = useState<boolean>(true);
  const [nominalPokokDisplay, setNominalPokokDisplay] = useState<string>('');
  const [rekeningBankPokok, setRekeningBankPokok] = useState<string>(
    defaultBriAccount?.kode || bankAccounts[0]?.kode || ''
  );

  useEffect(() => {
    if (!rekeningBankPokok && defaultBriAccount?.kode) {
      setRekeningBankPokok(defaultBriAccount.kode);
    }
    if (!rekeningAdminBank && defaultBriAccount?.kode) {
      setRekeningAdminBank(defaultBriAccount.kode);
    }
  }, [defaultBriAccount, rekeningBankPokok, rekeningAdminBank]);

  const [divisi, setDivisi] = useState<string>('BRILink');
  const [keterangan, setKeterangan] = useState<string>('');
  const [fotoBukti, setFotoBukti] = useState<string>('');

  const [stepVerifikasi, setStepVerifikasi] = useState<boolean>(false);
  const [verifiedDoubleCheck, setVerifiedDoubleCheck] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successBanner, setSuccessBanner] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterJenis, setFilterJenis] = useState<'ALL' | JenisTransaksiBrilink>('ALL');
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);
  const [voidLoading, setVoidLoading] = useState<boolean>(false);
  const [editTxId, setEditTxId] = useState<string | null>(null);

  const nominalAdmin = parseRupiahInput(nominalAdminDisplay);
  const nominalPokok = catatMutasiPokok ? parseRupiahInput(nominalPokokDisplay) : 0;
  const isTarikTunai = jenisBrilink === 'TARIK_TUNAI';
  const directionAdmin: 'MASUK' | 'KELUAR' = isTarikTunai ? 'MASUK' : 'KELUAR';

  const kpi = useMemo(() => {
    let totalAdmMasuk = 0;
    let countMasuk = 0;
    let totalAdmKeluar = 0;
    let countKeluar = 0;

    for (const b of brilinkList) {
      const adm = Number(b.nominalAdmin) || 0;
      if (b.jenisBrilink === 'TARIK_TUNAI') {
        totalAdmMasuk += adm;
        countMasuk += 1;
      } else {
        totalAdmKeluar += adm;
        countKeluar += 1;
      }
    }

    return {
      totalAdmMasuk,
      countMasuk,
      totalAdmKeluar,
      countKeluar,
      labaBersihAdm: totalAdmMasuk - totalAdmKeluar,
    };
  }, [brilinkList]);

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return brilinkList.filter((item) => {
      if (filterJenis !== 'ALL' && item.jenisBrilink !== filterJenis) return false;
      if (!q) return true;
      return (
        item.idTransaksi.toLowerCase().includes(q) ||
        (item.namaPelanggan || '').toLowerCase().includes(q) ||
        (item.keterangan || '').toLowerCase().includes(q) ||
        (item.rekeningAdmin || '').toLowerCase().includes(q)
      );
    });
  }, [brilinkList, filterJenis, searchQuery]);

  const pelangganFinalLabel = useMemo(() => {
    if (modePelanggan === 'MITRA') {
      return activeMitra.find((m) => m.id === idMitra)?.nama || 'Mitra';
    }
    return (
      namaPelangganManual.trim() ||
      (isTarikTunai ? 'Pelanggan Tarik Tunai' : 'Tukar Cash Rupiah PT')
    );
  }, [modePelanggan, activeMitra, idMitra, namaPelangganManual, isTarikTunai]);

  const handleQuickAddMitra = async () => {
    if (!newMitraNama.trim()) return;
    setSavingMitra(true);
    setErrorMsg('');
    try {
      const created = await api.createMitra({
        nama: newMitraNama.trim(),
        role: 'CUSTOMER',
        telepon: newMitraTelepon.trim() || '-',
        alamat: '-',
      });
      onRefresh();
      setModePelanggan('MITRA');
      setIdMitra(created.id);
      setNewMitraNama('');
      setNewMitraTelepon('');
      setShowQuickAddMitra(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menambah mitra baru.');
    } finally {
      setSavingMitra(false);
    }
  };

  const validateForm = (): boolean => {
    setErrorMsg('');
    if (modeInput === 'TARIK_TUNAI_PENUH') {
      if (nominalPokok <= 0) {
        setErrorMsg(
          'Masukkan Nominal Uang Pokok Tarik Tunai yang keluar dari Kasir (KAS01) lebih dari Rp 0.'
        );
        return false;
      }
      if (!rekeningBankPokok) {
        setErrorMsg('Pilih rekening BRI / Bank kantor penerima transfer pengganti tarik tunai.');
        return false;
      }
    } else if (nominalAdmin <= 0 && (!catatMutasiPokok || nominalPokok <= 0)) {
      setErrorMsg(
        isTarikTunai
          ? 'Masukkan nominal Uang Masuk Admin BRILink lebih dari Rp 0.'
          : 'Masukkan nominal Uang Keluar Admin Tukar Cash Rupiah PT lebih dari Rp 0.'
      );
      return false;
    }
    if (nominalAdmin > 0 && metodeAdmin === 'TRANSFER' && !rekeningAdminBank) {
      setErrorMsg('Pilih rekening bank pencatatan admin.');
      return false;
    }
    if (catatMutasiPokok && nominalPokok > 0 && !rekeningBankPokok) {
      setErrorMsg('Pilih rekening Bank BRI / PT untuk mutasi pokok tarik tunai / tukar cash.');
      return false;
    }
    return true;
  };

  const handleOpenVerifikasi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setVerifiedDoubleCheck(false);
    setStepVerifikasi(true);
  };

  const buildReceiptFromRecord = (rec: TransaksiBrilink): ReceiptData => {
    const isMasuk = rec.jenisBrilink === 'TARIK_TUNAI';
    const pokok = Number(rec.nominalPokok) || 0;
    const divLabel = isTanpaDivisi(rec.divisi) ? 'Tanpa Arus Kas Divisi' : rec.divisi || 'BRILink';
    return {
      title:
        isMasuk && pokok > 0
          ? 'STRUK JASA TARIK TUNAI BRILINK (KAS01 → BRI)'
          : isMasuk
          ? 'STRUK AGEN BRILINK — ADM TARIK TUNAI (+)'
          : 'BUKTI BRILINK — ADM TUKAR CASH PT (−)',
      subtitle: `${
        isMasuk && pokok > 0
          ? `Tarik Tunai ${formatRupiah(pokok)} + Adm ${formatRupiah(rec.nominalAdmin)}`
          : isMasuk
          ? 'Uang Masuk Admin Tarik Tunai'
          : 'Uang Keluar Admin Tukar Cash Rupiah'
      } | Divisi Admin: ${divLabel}`,
      nomorTransaksi: rec.idTransaksi,
      tanggal: rec.tanggal,
      jam: rec.jam,
      mitra: rec.namaPelanggan || 'Umum',
      rekening: rec.rekeningAdmin,
      kategori: 'BRILINK',
      total: pokok > 0 && rec.nominalAdmin === 0 ? pokok : rec.nominalAdmin,
      items: [
        ...(pokok > 0
          ? [
              {
                nama: isMasuk
                  ? `Uang Tunai Keluar Kasir (KAS01) → Masuk Rek ${rec.rekeningBank || 'BRI01'}`
                  : `Tukar Cash Bank ${rec.rekeningBank || '-'} → Masuk Kasir (KAS01)`,
                qty: 1,
                satuan: 'Mutasi Pokok',
                harga: pokok,
                subtotal: pokok,
              },
            ]
          : []),
        ...(rec.nominalAdmin > 0
          ? [
              {
                nama: isMasuk
                  ? 'Pendapatan Biaya Admin Tarik Tunai BRILink'
                  : 'Biaya Admin Tukar Cash Rupiah PT',
                qty: 1,
                satuan: 'Admin',
                harga: rec.nominalAdmin,
                subtotal: rec.nominalAdmin,
              },
            ]
          : []),
      ],
      detailRows: [
        ...(pokok > 0
          ? [
              {
                label: isMasuk
                  ? 'Uang Tunai Keluar Kasir (KAS01)'
                  : 'Uang Tunai Masuk Kasir (KAS01)',
                value: `${isMasuk ? '−' : '+'}${formatRupiah(pokok)}`,
                highlight: true,
              },
              {
                label: isMasuk
                  ? `Uang Pengganti Masuk (${rec.rekeningBank || 'BRI01'})`
                  : `Saldo Bank Berkurang (${rec.rekeningBank || '-'})`,
                value: `${isMasuk ? '+' : '−'}${formatRupiah(pokok)} (Non-Divisi)`,
                highlight: true,
              },
            ]
          : []),
        {
          label: 'Divisi Biaya Admin',
          value: rec.nominalAdmin > 0 ? divLabel : 'Tidak Ada Biaya Admin (Rp 0)',
        },
        { label: 'Rekening Biaya Admin', value: rec.rekeningAdmin },
        {
          label: isMasuk ? 'Pendapatan Biaya Admin BRILink' : 'Biaya Admin Tukar Cash',
          value: formatRupiah(rec.nominalAdmin),
          isTotal: true,
        },
      ],
      catatan: rec.keterangan,
    };
  };

  const handleFinalSubmit = async () => {
    if (!validateForm()) return;
    if (!verifiedDoubleCheck) {
      setErrorMsg('Harap centang verifikasi rekening & divisi terlebih dahulu.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const rekeningAdminKode = metodeAdmin === 'TUNAI' ? 'KAS01' : rekeningAdminBank;
      const record = await api.processBrilink({
        tanggal,
        jenisBrilink,
        idMitra: modePelanggan === 'MITRA' ? idMitra : undefined,
        namaPelangganManual: pelangganFinalLabel,
        nominalPokok: catatMutasiPokok ? nominalPokok : 0,
        nominalAdmin,
        rekeningAdmin: rekeningAdminKode,
        rekeningBank:
          catatMutasiPokok && nominalPokok > 0 ? rekeningBankPokok : undefined,
        divisi,
        keterangan: keterangan.trim() || undefined,
        fotoBukti: fotoBukti || undefined,
      });

      const receipt = buildReceiptFromRecord(record);
      setNominalAdminDisplay('');
      setNominalPokokDisplay('');
      setKeterangan('');
      setFotoBukti('');
      setStepVerifikasi(false);
      setVerifiedDoubleCheck(false);
      setSuccessBanner(
        `Transaksi BRILink ${record.idTransaksi} berhasil disimpan ke Cloud Supabase! ${
          (record.nominalPokok || 0) > 0
            ? `Pokok ${formatRupiah(record.nominalPokok || 0)} (${
                isTarikTunai
                  ? `KAS01 keluar → ${record.rekeningBank || 'BRI01'} masuk`
                  : `${record.rekeningBank || 'Bank'} keluar → KAS01 masuk`
              }) · `
            : ''
        }Admin: ${formatRupiah(record.nominalAdmin)}.`
      );
      onRefresh();
      onSuccess(receipt);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan transaksi BRILink.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async (idTransaksi: string) => {
    setVoidLoading(true);
    setErrorMsg('');
    try {
      await api.deleteBrilink(idTransaksi);
      setConfirmVoidId(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal membatalkan transaksi BRILink.');
    } finally {
      setVoidLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
            Menu Agen BRILink — Adm Tarik Tunai (+) &amp; Tukar Cash PT (−)
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Fokus pencatatan Uang Masuk dari Admin Tarik Tunai pelanggan dan Uang Keluar saat PT melakukan Tukar Cash Rupiah
          </p>
        </div>
      </div>

      {/* 3 Kartu KPI Ringkasan BRILink */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <div className="flex items-center justify-between text-zinc-500 text-[11px] font-semibold uppercase tracking-wider">
            <span>Uang Masuk: Adm Tarik Tunai</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-700" />
          </div>
          <div
            className="mt-1.5 text-xl font-bold font-mono tabular-nums text-emerald-700 truncate"
            title={formatRupiah(kpi.totalAdmMasuk)}
          >
            +{formatRupiahSingkat(kpi.totalAdmMasuk)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 font-mono tabular-nums">
            {formatRupiah(kpi.totalAdmMasuk)} · {kpi.countMasuk} transaksi
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <div className="flex items-center justify-between text-zinc-500 text-[11px] font-semibold uppercase tracking-wider">
            <span>Uang Keluar: Adm Tukar Cash PT</span>
            <ArrowUpRight className="w-4 h-4 text-rose-700" />
          </div>
          <div
            className="mt-1.5 text-xl font-bold font-mono tabular-nums text-rose-700 truncate"
            title={formatRupiah(kpi.totalAdmKeluar)}
          >
            −{formatRupiahSingkat(kpi.totalAdmKeluar)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 font-mono tabular-nums">
            {formatRupiah(kpi.totalAdmKeluar)} · {kpi.countKeluar} transaksi
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <div className="flex items-center justify-between text-zinc-500 text-[11px] font-semibold uppercase tracking-wider">
            <span>Selisih Bersih Admin BRILink</span>
            <CreditCard className="w-4 h-4 text-sky-700" />
          </div>
          <div
            className={`mt-1.5 text-xl font-bold font-mono tabular-nums truncate ${
              kpi.labaBersihAdm >= 0 ? 'text-zinc-900' : 'text-rose-700'
            }`}
            title={formatRupiah(kpi.labaBersihAdm)}
          >
            {kpi.labaBersihAdm >= 0 ? '+' : ''}
            {formatRupiahSingkat(kpi.labaBersihAdm)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 font-mono tabular-nums">
            {formatRupiah(kpi.labaBersihAdm)}
          </div>
        </div>
      </div>

      {successBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="font-medium">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner('')}
            className="text-emerald-800 font-semibold hover:underline cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="text-rose-800 font-semibold hover:underline cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Form Transaksi BRILink */}
      <form
        onSubmit={handleOpenVerifikasi}
        className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6 space-y-5 text-xs"
      >
        {/* Step 1: Pilih Mode BRILink (Jasa Tarik Tunai Penuh vs Input Admin Saja vs Tukar Cash PT) */}
        <div className="space-y-2">
          <label className="block text-[11px] font-bold text-zinc-800 uppercase tracking-wider">
            1. Pilih Jenis Layanan / Transaksi BRILink
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => {
                setModeInput('TARIK_TUNAI_PENUH');
                setJenisBrilink('TARIK_TUNAI');
                setCatatMutasiPokok(true);
                if (defaultBriAccount?.kode) {
                  setRekeningBankPokok(defaultBriAccount.kode);
                }
                setStepVerifikasi(false);
                setVerifiedDoubleCheck(false);
              }}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                modeInput === 'TARIK_TUNAI_PENUH'
                  ? 'bg-sky-50 border-sky-600 ring-2 ring-sky-600/30'
                  : 'bg-white border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-zinc-900 text-sm">
                  🏧 Jasa Tarik Tunai Pelanggan
                </span>
                <span className="font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-sky-100 text-sky-900">
                  KAS01 → BRI
                </span>
              </div>
              <p className="text-[11px] text-zinc-600 mt-1 leading-relaxed">
                <strong>Uang tunai keluar dari Kasir (KAS01)</strong>, uang penggantinya ditransfer pelanggan <strong>masuk ke Rekening BRI Kantor</strong> (tanpa masuk divisi), dan <strong>Biaya Admin</strong> masuk ke Divisi BRILink.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setModeInput('ADM_MASUK_SAJA');
                setJenisBrilink('TARIK_TUNAI');
                setCatatMutasiPokok(false);
                setNominalPokokDisplay('');
                setStepVerifikasi(false);
                setVerifiedDoubleCheck(false);
              }}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                modeInput === 'ADM_MASUK_SAJA'
                  ? 'bg-emerald-50 border-emerald-600 ring-2 ring-emerald-600/30'
                  : 'bg-white border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-zinc-900 text-sm">
                  + Input Biaya Admin Saja
                </span>
                <span className="font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900">
                  ADM MASUK (+)
                </span>
              </div>
              <p className="text-[11px] text-zinc-600 mt-1 leading-relaxed">
                Khusus mencatat <strong>Pendapatan Biaya Admin BRILink</strong> saja ke Kas/Bank &amp; Divisi BRILink tanpa mutasi pokok tarik tunai.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setModeInput('TUKAR_CASH');
                setJenisBrilink('TUKAR_CASH');
                setCatatMutasiPokok(false);
                setStepVerifikasi(false);
                setVerifiedDoubleCheck(false);
              }}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                modeInput === 'TUKAR_CASH'
                  ? 'bg-rose-50 border-rose-600 ring-2 ring-rose-600/30'
                  : 'bg-white border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-zinc-900 text-sm">
                  − Tukar Cash Rupiah PT
                </span>
                <span className="font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-100 text-rose-900">
                  KAS KELUAR (−)
                </span>
              </div>
              <p className="text-[11px] text-zinc-600 mt-1 leading-relaxed">
                PT menukar saldo bank menjadi uang cash fisik rupiah. <strong>Biaya Admin Tukar Cash</strong> tercatat sebagai pengeluaran kas/bank PT.
              </p>
            </button>
          </div>
        </div>

        {/* Step 2: Pelanggan / Mitra & Tanggal */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-zinc-800">
                2. Pelanggan / Agen Lawan Transaksi
              </label>
              <div className="flex items-center space-x-2">
                <div className="inline-flex rounded border border-zinc-200 bg-zinc-100 p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setModePelanggan('UMUM')}
                    className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                      modePelanggan === 'UMUM' ? 'bg-white text-zinc-900' : 'text-zinc-600'
                    }`}
                  >
                    Pelanggan Umum
                  </button>
                  <button
                    type="button"
                    onClick={() => setModePelanggan('MITRA')}
                    className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                      modePelanggan === 'MITRA' ? 'bg-white text-zinc-900' : 'text-zinc-600'
                    }`}
                  >
                    Mitra Terdaftar
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickAddMitra((p) => !p)}
                  className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Mitra Baru</span>
                </button>
              </div>
            </div>

            {modePelanggan === 'UMUM' ? (
              <input
                type="text"
                placeholder={
                  isTarikTunai
                    ? 'Ketik nama pelanggan tarik tunai (opsional)...'
                    : 'Ketik nama agen / bank tempat PT tukar cash rupiah...'
                }
                value={namaPelangganManual}
                onChange={(e) => setNamaPelangganManual(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 font-medium focus:outline-none focus:border-emerald-600"
              />
            ) : (
              <select
                value={idMitra}
                onChange={(e) => setIdMitra(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-900 font-semibold focus:outline-none focus:border-emerald-600"
              >
                {activeMitra.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nama} ({m.role})
                  </option>
                ))}
              </select>
            )}

            {showQuickAddMitra && (
              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Nama mitra baru..."
                  value={newMitraNama}
                  onChange={(e) => setNewMitraNama(e.target.value)}
                  className="px-2.5 py-1.5 rounded border border-zinc-300 bg-white text-zinc-900"
                />
                <input
                  type="text"
                  placeholder="No HP (opsional)..."
                  value={newMitraTelepon}
                  onChange={(e) => setNewMitraTelepon(e.target.value)}
                  className="px-2.5 py-1.5 rounded border border-zinc-300 bg-white text-zinc-900"
                />
                <button
                  type="button"
                  disabled={savingMitra || !newMitraNama.trim()}
                  onClick={handleQuickAddMitra}
                  className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 disabled:bg-zinc-300 text-white font-semibold cursor-pointer"
                >
                  {savingMitra ? 'Menyimpan...' : 'Simpan Mitra'}
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-zinc-800 mb-1.5">
              Tanggal Transaksi
            </label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 font-mono tabular-nums text-zinc-900 focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Step 3A: Blok Utama Jasa Tarik Tunai Pelanggan (Uang Keluar KAS01 -> Masuk Rek BRI) */}
        {modeInput === 'TARIK_TUNAI_PENUH' && (
          <div className="p-4 rounded-xl border-2 border-sky-300 bg-sky-50/50 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-sky-200 pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-sky-950 uppercase tracking-wider flex items-center gap-1.5">
                  <ArrowLeftRight className="w-4 h-4 text-sky-700" />
                  <span>3A. Mutasi Pokok Tarik Tunai (Kasir KAS01 Keluar → Rekening BRI Masuk)</span>
                </h3>
                <p className="text-[11px] text-sky-800 mt-0.5">
                  Otomatis mengurangi uang fisik di <strong>KAS01 (Kasir Utama)</strong> dan menambah saldo <strong>Rekening BRI Kantor</strong> tanpa mengotori Arus Kas Divisi.
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-1 rounded bg-sky-200/80 text-sky-950 self-start">
                MUTASI ANTAR REKENING PT (NON-DIVISI)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-zinc-900 mb-1">
                  Nominal Uang Tunai Diberikan dari Kasir / KAS01 (Rp) <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-400 font-mono font-bold">
                    Rp
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Contoh: 1.000.000"
                    value={nominalPokokDisplay}
                    onChange={(e) => {
                      const num = parseRupiahInput(e.target.value);
                      setNominalPokokDisplay(num > 0 ? num.toLocaleString('id-ID') : '');
                      setStepVerifikasi(false);
                    }}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-sky-400 bg-white font-mono tabular-nums text-base font-bold text-sky-950 focus:outline-none focus:border-sky-700"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {QUICK_POKOK_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        setNominalPokokDisplay(amt.toLocaleString('id-ID'));
                        setStepVerifikasi(false);
                      }}
                      className="px-2 py-1 rounded border border-sky-300 bg-white hover:bg-sky-100 font-mono tabular-nums text-[10px] font-semibold text-sky-900 cursor-pointer"
                    >
                      {formatRupiahSingkat(amt)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-900 mb-1">
                  Rekening Bank Penerima Transfer Pelanggan (Default BRI) <span className="text-rose-600">*</span>
                </label>
                <select
                  value={rekeningBankPokok}
                  onChange={(e) => {
                    setRekeningBankPokok(e.target.value);
                    setStepVerifikasi(false);
                  }}
                  className="w-full px-3 py-2.5 rounded-lg border border-sky-400 bg-white text-zinc-900 font-bold focus:outline-none focus:border-sky-700"
                >
                  {bankAccounts.map((rek) => (
                    <option key={rek.kode} value={rek.kode}>
                      {rek.kode} — {rek.nama} (Saldo: {formatRupiah(rek.saldoSaatIni)})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-sky-800 mt-1.5">
                  Semua pelanggan tarik tunai diarahkan transfer ke rekening BRI kantor di atas sehingga uang kasir yang keluar otomatis tergantikan di saldo bank.
                </p>
              </div>
            </div>

            {/* Simulasi Real-Time 3 Kotak: KAS01 Keluar, BRI Masuk, Admin Masuk */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <div className="p-2.5 rounded-lg bg-white border border-rose-200 font-mono text-[11px]">
                <div className="text-[10px] font-sans font-bold text-rose-800 flex items-center gap-1">
                  <Wallet className="w-3 h-3" />
                  <span>1. Uang Keluar Kasir (KAS01)</span>
                </div>
                <div className="text-sm font-extrabold text-rose-700 mt-0.5">
                  −{formatRupiah(nominalPokok)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  Sisa KAS01:{' '}
                  {formatRupiah(
                    (kas01Acc?.saldoSaatIni || 0) -
                      nominalPokok +
                      (metodeAdmin === 'TUNAI' ? nominalAdmin : 0)
                  )}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-sky-200 font-mono text-[11px]">
                <div className="text-[10px] font-sans font-bold text-sky-800 flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  <span>2. Masuk Rek {rekeningBankPokok || 'BRI01'}</span>
                </div>
                <div className="text-sm font-extrabold text-sky-700 mt-0.5">
                  +{formatRupiah(nominalPokok)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  Otomatis Non-Divisi (Pengganti Kas)
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-emerald-200 font-mono text-[11px]">
                <div className="text-[10px] font-sans font-bold text-emerald-800 flex items-center gap-1">
                  <CreditCard className="w-3 h-3" />
                  <span>3. Untung Biaya Admin (+)</span>
                </div>
                <div className="text-sm font-extrabold text-emerald-700 mt-0.5">
                  +{formatRupiah(nominalAdmin)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
                  Ke {metodeAdmin === 'TUNAI' ? 'KAS01' : rekeningAdminBank} ·{' '}
                  {isTanpaDivisi(divisi) ? 'Non-Divisi' : divisi}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3B: Input Nominal Biaya Admin & Rekening Kas/Bank */}
        <div
          className={`p-4 rounded-xl border space-y-3.5 ${
            isTarikTunai
              ? 'bg-emerald-50/40 border-emerald-200'
              : 'bg-rose-50/40 border-rose-200'
          }`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-zinc-900 mb-1">
                {modeInput === 'TARIK_TUNAI_PENUH'
                  ? '3B. Biaya Admin Tarik Tunai untuk Divisi BRILink (Rp) — Isi Rp 0 jika diinput terpisah'
                  : isTarikTunai
                  ? '3. Nominal Uang Masuk — Admin Tarik Tunai (Rp)'
                  : '3. Nominal Uang Keluar — Admin Tukar Cash PT (Rp)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-zinc-400 font-mono font-bold">
                  Rp
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={modeInput === 'TARIK_TUNAI_PENUH' ? 'Contoh: 10.000 (atau kosongkan = Rp 0)' : 'Contoh: 10.000'}
                  value={nominalAdminDisplay}
                  onChange={(e) => {
                    const num = parseRupiahInput(e.target.value);
                    setNominalAdminDisplay(num > 0 ? num.toLocaleString('id-ID') : '');
                    setStepVerifikasi(false);
                  }}
                  className={`w-full pl-9 pr-3 py-2 rounded-lg border bg-white font-mono tabular-nums text-base font-bold focus:outline-none ${
                    isTarikTunai
                      ? 'border-emerald-400 text-emerald-900 focus:border-emerald-600'
                      : 'border-rose-400 text-rose-900 focus:border-rose-600'
                  }`}
                />
              </div>

              {/* Tombol Cepat Nominal Admin */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {modeInput === 'TARIK_TUNAI_PENUH' && (
                  <button
                    type="button"
                    onClick={() => {
                      setNominalAdminDisplay('');
                      setStepVerifikasi(false);
                    }}
                    className="px-2 py-1 rounded border border-zinc-300 bg-zinc-100 hover:bg-zinc-200 font-mono tabular-nums text-[10px] font-bold text-zinc-700 cursor-pointer"
                  >
                    Rp 0 (Tanpa Admin)
                  </button>
                )}
                {QUICK_ADMIN_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setNominalAdminDisplay(amt.toLocaleString('id-ID'));
                      setStepVerifikasi(false);
                    }}
                    className="px-2 py-1 rounded border border-zinc-300 bg-white hover:bg-zinc-100 font-mono tabular-nums text-[10px] font-semibold text-zinc-700 cursor-pointer"
                  >
                    {amt.toLocaleString('id-ID')}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-zinc-900">
                Rekening {isTarikTunai ? 'Penerima Uang Biaya Admin (+)' : 'Sumber Bayar Biaya Admin (−)'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMetodeAdmin('TUNAI');
                    setStepVerifikasi(false);
                  }}
                  className={`py-2 px-3 rounded-lg border font-semibold transition-colors cursor-pointer ${
                    metodeAdmin === 'TUNAI'
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  Dibayar Tunai (KAS01)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMetodeAdmin('TRANSFER');
                    setStepVerifikasi(false);
                  }}
                  className={`py-2 px-3 rounded-lg border font-semibold transition-colors cursor-pointer ${
                    metodeAdmin === 'TRANSFER'
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  Ikut Masuk Rek Bank
                </button>
              </div>

              {metodeAdmin === 'TRANSFER' && (
                <select
                  value={rekeningAdminBank}
                  onChange={(e) => {
                    setRekeningAdminBank(e.target.value);
                    setStepVerifikasi(false);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-900 font-semibold focus:outline-none focus:border-emerald-600"
                >
                  {bankAccounts.map((rek) => (
                    <option key={rek.kode} value={rek.kode}>
                      {rek.kode} — {rek.nama} ({formatRupiahSingkat(rek.saldoSaatIni)})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Opsional Mutasi Pokok untuk mode Tukar Cash PT */}
          {modeInput === 'TUKAR_CASH' && (
            <div className="pt-2 border-t border-zinc-200/80 space-y-2.5">
              <label className="inline-flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={catatMutasiPokok}
                  onChange={(e) => {
                    setCatatMutasiPokok(e.target.checked);
                    setStepVerifikasi(false);
                  }}
                  className="rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600"
                />
                <span className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-sky-700" />
                  <span>
                    Catat sekaligus mutasi uang pokok Tukar Cash (−Bank PT / +KAS01)? (Opsional)
                  </span>
                </span>
              </label>

              {catatMutasiPokok && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-white border border-zinc-200">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Nominal Pokok Tukar Cash (Rp)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Contoh: 5.000.000"
                      value={nominalPokokDisplay}
                      onChange={(e) => {
                        const num = parseRupiahInput(e.target.value);
                        setNominalPokokDisplay(num > 0 ? num.toLocaleString('id-ID') : '');
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 font-mono tabular-nums font-bold text-zinc-900 focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Rekening Bank PT Sumber Tukar Cash
                    </label>
                    <select
                      value={rekeningBankPokok}
                      onChange={(e) => setRekeningBankPokok(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-900 font-semibold focus:outline-none focus:border-sky-600"
                    >
                      {bankAccounts.map((rek) => (
                        <option key={rek.kode} value={rek.kode}>
                          {rek.kode} — {rek.nama} ({formatRupiahSingkat(rek.saldoSaatIni)})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Divisi & Catatan */}
        <ArusKasDivisiSelectorCard
          direction={directionAdmin}
          transactionKind={isTarikTunai ? 'PENJUALAN' : 'BEBAN_PENGELUARAN'}
          metode={metodeAdmin}
          nominal={nominalAdmin}
          divisi={divisi}
          divisiOptions={divisiOptions}
          onChangeDivisi={(d) => {
            setVerifiedDoubleCheck(false);
            setDivisi(d);
          }}
          rekeningList={rekeningList}
          theme="light"
        />

        <div>
          <label className="block text-[11px] font-bold text-zinc-800 mb-1">
            Catatan Transaksi BRILink (Opsional)
          </label>
          <input
            type="text"
            placeholder={
              isTarikTunai
                ? 'Contoh: Tarik tunai BRI kartu ATM pelanggan...'
                : 'Contoh: Tukar cash rupiah untuk stok laci kasir gudang...'
            }
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <ImageUploadZone
          label="Foto Struk EDC BRILink / Bukti Tukar Cash (Opsional)"
          sublabel="Lampirkan foto struk mesin EDC atau bukti mutasi"
          value={fotoBukti}
          onChange={setFotoBukti}
        />

        {stepVerifikasi && (
          <DoubleCheckVerifikasiPanel
            direction={directionAdmin}
            transactionKind={isTarikTunai ? 'PENJUALAN' : 'BEBAN_PENGELUARAN'}
            metode={metodeAdmin}
            nominal={nominalAdmin}
            rekeningList={rekeningList}
            selectedTransferKode={rekeningAdminBank}
            onChangeTransferKode={setRekeningAdminBank}
            divisi={divisi}
            divisiOptions={divisiOptions}
            onChangeDivisi={setDivisi}
            verified={verifiedDoubleCheck}
            onToggleVerified={setVerifiedDoubleCheck}
            theme="light"
          />
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-200">
          {stepVerifikasi ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setStepVerifikasi(false);
                  setVerifiedDoubleCheck(false);
                }}
                disabled={submitting}
                className="px-4 py-2.5 rounded-lg border border-zinc-300 text-zinc-700 font-semibold hover:bg-zinc-50 cursor-pointer"
              >
                Cek Ulang Input
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting || !verifiedDoubleCheck}
                className={`px-5 py-2.5 rounded-lg disabled:bg-zinc-300 text-white font-semibold flex items-center space-x-2 cursor-pointer transition-colors ${
                  isTarikTunai
                    ? 'bg-emerald-700 hover:bg-emerald-800'
                    : 'bg-rose-700 hover:bg-rose-800'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Menyimpan...'
                    : modeInput === 'TARIK_TUNAI_PENUH'
                    ? 'Ya, Simpan Jasa Tarik Tunai (KAS01 → BRI)'
                    : isTarikTunai
                    ? 'Ya, Simpan Uang Masuk Adm Tarik Tunai'
                    : 'Ya, Simpan Uang Keluar Adm Tukar Cash'}
                </span>
              </button>
            </>
          ) : (
            <button
              type="submit"
              disabled={
                submitting ||
                (modeInput === 'TARIK_TUNAI_PENUH' ? nominalPokok <= 0 : nominalAdmin <= 0)
              }
              className={`px-5 py-2.5 rounded-lg disabled:bg-zinc-300 text-white font-semibold flex items-center space-x-2 cursor-pointer transition-colors ${
                modeInput === 'TARIK_TUNAI_PENUH'
                  ? 'bg-sky-700 hover:bg-sky-800'
                  : isTarikTunai
                  ? 'bg-emerald-700 hover:bg-emerald-800'
                  : 'bg-rose-700 hover:bg-rose-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Lanjut Verifikasi Rekening &amp; Divisi →</span>
            </button>
          )}
        </div>
      </form>

      {/* Tabel Riwayat Transaksi BRILink */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">
              Riwayat Transaksi BRILink ({filteredHistory.length})
            </h2>
            <p className="text-[11px] text-zinc-500">
              Rekap uang masuk admin tarik tunai dan uang keluar admin tukar cash rupiah PT
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs">
              {(
                [
                  { id: 'ALL', label: 'Semua' },
                  { id: 'TARIK_TUNAI', label: '+ Adm Tarik Tunai' },
                  { id: 'TUKAR_CASH', label: '− Adm Tukar Cash' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterJenis(tab.id)}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                    filterJenis === tab.id
                      ? 'bg-white text-zinc-900 shadow-2xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Cari nota, pelanggan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 text-xs focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">No Nota</th>
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Jenis Transaksi</th>
                <th className="py-3 px-4">Pelanggan / Agen</th>
                <th className="py-3 px-4 text-right">Pokok Mutasi</th>
                <th className="py-3 px-4">Rekening Admin</th>
                <th className="py-3 px-4 text-right">Nominal Admin</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-zinc-400">
                    Belum ada catatan transaksi BRILink pada filter ini.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => {
                  const isMasuk = item.jenisBrilink === 'TARIK_TUNAI';
                  const pokok = Number(item.nominalPokok) || 0;
                  return (
                    <tr key={item.idTransaksi} className="hover:bg-zinc-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-zinc-900">
                        {item.idTransaksi}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-zinc-600 whitespace-nowrap">
                        {item.tanggal}{' '}
                        <span className="text-[10px] text-zinc-400">{item.jam}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-bold ${
                            isMasuk ? 'text-emerald-800' : 'text-rose-800'
                          }`}
                        >
                          {isMasuk ? '+ Adm Tarik Tunai' : '− Adm Tukar Cash PT'}
                        </span>
                        {item.keterangan && (
                          <div className="text-[11px] text-zinc-500 truncate max-w-xs">
                            {item.keterangan}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold text-zinc-800">
                        {item.namaPelanggan || 'Umum'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-600">
                        {pokok > 0
                          ? `${formatRupiahSingkat(pokok)} (${item.rekeningBank || '-'})`
                          : '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-700">
                        {item.rekeningAdmin} · {item.divisi || 'BRILink'}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                          isMasuk ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                        title={formatRupiah(item.nominalAdmin)}
                      >
                        {isMasuk ? '+' : '−'}
                        {formatRupiah(item.nominalAdmin)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {confirmVoidId === item.idTransaksi ? (
                          <div className="inline-flex items-center space-x-1">
                            <button
                              type="button"
                              disabled={voidLoading}
                              onClick={() => handleVoid(item.idTransaksi)}
                              className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-semibold cursor-pointer"
                            >
                              {voidLoading ? '...' : 'Ya, Batal'}
                            </button>
                            <button
                              type="button"
                              disabled={voidLoading}
                              onClick={() => setConfirmVoidId(null)}
                              className="px-2 py-1 rounded bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-[10px] font-semibold cursor-pointer"
                            >
                              Tidak
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => setEditTxId(item.idTransaksi)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-900 text-zinc-700 hover:text-white border border-zinc-200 text-[10px] font-semibold cursor-pointer transition-colors"
                              title="Edit nama pelanggan, nominal admin, pokok mutasi, rekening, atau tanggal"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onSuccess(buildReceiptFromRecord(item))}
                              className="p-1.5 rounded hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 cursor-pointer"
                              title="Cetak Struk BRILink"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmVoidId(item.idTransaksi)}
                              className="p-1.5 rounded hover:bg-rose-50 text-zinc-400 hover:text-rose-600 cursor-pointer"
                              title="Batalkan Transaksi BRILink"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

      <ModalEditTransaksiUniversal
        isOpen={Boolean(editTxId)}
        transactionId={editTxId}
        jenisHint="BRILINK"
        onClose={() => setEditTxId(null)}
        onSuccess={() => {
          onRefresh();
        }}
      />
    </div>
  );
};
