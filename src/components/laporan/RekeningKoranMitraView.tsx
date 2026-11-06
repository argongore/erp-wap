import React, { useState, useEffect, useMemo } from 'react';
import {
  Printer,
  AlertCircle,
  FileText,
  Copy,
  Check,
  Eye,
  LayoutTemplate,
  Building2,
  Calendar,
  User,
  Phone,
  MapPin,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  X,
  FileDown,
  Camera,
  Pencil,
  Save,
  HandCoins,
  Share2,
  Activity,
  TrendingUp,
  TrendingDown,
  Trash2,
  ArrowRightLeft,
  RotateCcw,
  Lock,
  Unlock,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Area,
  AreaChart,
} from 'recharts';
import {
  DEFAULT_PT_LOGO_URL,
  getRoleMitraLabel,
  Mitra,
  ProfilPerusahaan,
  Rekening,
  RekeningKoranHistoryItem,
  RekeningKoranMitraSummary,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat, formatTanggalIndo } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { CetakRekeningKoranModal } from './CetakRekeningKoranModal.tsx';
import { FotoNotaPreviewModal } from '../common/FotoNotaPreviewModal.tsx';
import { ModalPinjamUangMitra } from '../common/ModalPinjamUangMitra.tsx';
import { ShareLinkModal } from '../public/ShareLinkModal.tsx';
import { ModalBersihkanNotaLalu } from '../common/ModalBersihkanNotaLalu.tsx';
import { ModalTransaksiAnakPerusahaan } from '../common/ModalTransaksiAnakPerusahaan.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';
import {
  KliringModalMode,
  ModalKliringSilangMitra,
} from '../common/ModalKliringSilangMitra.tsx';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { ModalToggleNotaNgunci } from '../master/RekapKhususMitraNgunciSection.tsx';

// Generated authentic visual preview mockup
import rekeningKoranMockupImg from '../../assets/images/rekening_koran_preview_1790406863342.jpg';

interface Props {
  mitraList: Mitra[];
  rekeningList?: Rekening[];
  profilPerusahaan?: ProfilPerusahaan | null;
  onOpenProfilPerusahaan?: () => void;
  onNavigateToBayarGaji?: (idKaryawan?: string) => void;
  selectedMitraId?: string;
  onSelectMitra: (id: string) => void;
  onRefreshParent?: () => void;
  onSuccessReceipt?: (receipt: ReceiptData) => void;
}

export const RekeningKoranMitraView: React.FC<Props> = ({
  mitraList,
  rekeningList = [],
  profilPerusahaan,
  onOpenProfilPerusahaan,
  onNavigateToBayarGaji,
  selectedMitraId,
  onSelectMitra,
  onRefreshParent,
  onSuccessReceipt,
}) => {
  const currentMitraId = selectedMitraId || mitraList[0]?.id || '';
  const [statement, setStatement] = useState<RekeningKoranMitraSummary | null>(null);
  const [fetchedProfilFallback, setFetchedProfilFallback] = useState<ProfilPerusahaan | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [modalPinjamUangOpen, setModalPinjamUangOpen] = useState<boolean>(false);
  const [modalBersihkanNotaOpen, setModalBersihkanNotaOpen] = useState<boolean>(false);
  const [anakPerusahaanModalOpen, setAnakPerusahaanModalOpen] = useState<boolean>(false);
  const [kliringModalOpen, setKliringModalOpen] = useState<boolean>(false);
  const [kliringInitialMode, setKliringInitialMode] = useState<KliringModalMode>('KLIRING_SILANG');
  const [shareModalOpen, setShareModalOpen] = useState<boolean>(false);
  const [quickCopied, setQuickCopied] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'TABEL' | 'LEMBAR_CETAK'>('TABEL');
  const [ledgerTab, setLedgerTab] = useState<'SALDO_BERJALAN' | 'HISTORY_SELESAI'>('SALDO_BERJALAN');
  const [showMockupPreview, setShowMockupPreview] = useState<boolean>(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Edit / Nego Transaksi States
  const [editingEntry, setEditingEntry] = useState<{
    id: string;
    tanggal: string;
    jenis: string;
    keterangan: string;
    currentNominal: number;
  } | null>(null);
  const [editNominalInput, setEditNominalInput] = useState<string>('');
  const [editTanggalInput, setEditTanggalInput] = useState<string>('');
  const [editKeteranganInput, setEditKeteranganInput] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string>('');
  const [editErrorMsg, setEditErrorMsg] = useState<string>('');
  const [universalEditId, setUniversalEditId] = useState<string | null>(null);
  const [deleteTxTarget, setDeleteTxTarget] = useState<{
    idTransaksi: string;
    tanggal: string;
    uraian: string;
    nominal: number;
    keterangan?: string;
  } | null>(null);
  const [deletingTx, setDeletingTx] = useState<boolean>(false);
  const [deleteTxError, setDeleteTxError] = useState<string>('');
  const [confirmResetOpen, setConfirmResetOpen] = useState<boolean>(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState<boolean>(false);
  const [partnerActionBusy, setPartnerActionBusy] = useState<boolean>(false);

  // Modal Ubah Status Nota Piutang <-> Nota Kunci (dengan catatan kronologi)
  const [toggleNgunciTarget, setToggleNgunciTarget] = useState<{
    idMitra: string;
    namaMitra: string;
    idNota?: string;
    noNota?: string;
    nominal: number;
    targetNgunci: boolean;
    currentCatatan?: string;
  } | null>(null);
  const [toggleNgunciError, setToggleNgunciError] = useState<string>('');

  // Modal Terima Pembayaran Cepat Piutang / Nota Kunci langsung dari Rekening Mitra
  const [quickPayModal, setQuickPayModal] = useState<{
    open: boolean;
    idNotaTarget?: string;
    noNotaLabel?: string;
    sisaNotaTarget?: number;
    isTargetNgunci?: boolean;
  } | null>(null);
  const [quickPayMetode, setQuickPayMetode] = useState<'TUNAI' | 'TRANSFER' | 'SINKRON'>('TUNAI');
  const [quickPayRekening, setQuickPayRekening] = useState<string>('BNI01');
  const [quickPayNominalInput, setQuickPayNominalInput] = useState<string>('');
  const [quickPayKeterangan, setQuickPayKeterangan] = useState<string>('');
  const [quickPayBusy, setQuickPayBusy] = useState<boolean>(false);
  const [quickPayError, setQuickPayError] = useState<string>('');

  const [previewPhoto, setPreviewPhoto] = useState<{
    imageUrl: string;
    title: string;
    nomorBukti?: string;
    namaMitra?: string;
    tanggal?: string;
    nominalText?: string;
    keterangan?: string;
  } | null>(null);

  // Recharts: State grafik fluktuasi saldo titipan mitra
  const [showTitipChart, setShowTitipChart] = useState<boolean>(true);
  const [chartIncludeBon, setChartIncludeBon] = useState<boolean>(false);
  const [chartViewFilter, setChartViewFilter] = useState<'SEMUA' | 'MUTASI_TITIP_ONLY'>('SEMUA');

  // Compute chronological fluctuation data for Recharts
  const titipChartData = useMemo(() => {
    if (!statement || !statement.history) return [];

    // Chronological order (oldest to newest)
    const sorted = [...statement.history].sort((a, b) => {
      const [da, ma, ya] = (a.tanggal || '').split('/').map(Number);
      const [db, mb, yb] = (b.tanggal || '').split('/').map(Number);
      const timeA = new Date(ya, (ma || 1) - 1, da || 1).getTime();
      const timeB = new Date(yb, (mb || 1) - 1, db || 1).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return (a.jam || '').localeCompare(b.jam || '');
    });

    let runningTitip = 0;
    const rawPoints = sorted.map((item, idx) => {
      const jenisUpper = (item.jenis || '').toUpperCase();
      const isTitipMasuk =
        (jenisUpper.includes('TITIP') && !jenisUpper.includes('PENCAIRAN')) ||
        jenisUpper.includes('PINJAMAN UANG PT KE MITRA') ||
        jenisUpper.includes('UPAH KERJA');
      const isTitipKeluar =
        (jenisUpper.includes('PENCAIRAN') && jenisUpper.includes('TITIP')) ||
        jenisUpper.includes('PEMBAYARAN GAJI KARYAWAN');

      const nominalItem =
        item.nominalMutasiHak ||
        (item.itemsDetail && item.itemsDetail[0]?.subtotal) ||
        item.kredit ||
        item.debet ||
        0;

      let deltaTitip = 0;
      if (isTitipMasuk) {
        deltaTitip = nominalItem;
        runningTitip += deltaTitip;
      } else if (isTitipKeluar) {
        deltaTitip = -nominalItem;
        runningTitip = Math.max(0, runningTitip - nominalItem);
      }

      return {
        pointIndex: idx + 1,
        id: item.id,
        tanggal: item.tanggal,
        jam: item.jam,
        timeLabel: `${item.tanggal.slice(0, 5)}`,
        fullTime: `${item.tanggal} ${item.jam}`,
        jenis: item.jenis.replace(/_/g, ' '),
        keterangan: item.keterangan || '-',
        isTitipMutation: isTitipMasuk || isTitipKeluar,
        deltaTitip,
        saldoTitip: runningTitip,
        saldoBon: item.saldoAkumulasi || 0,
      };
    });

    if (chartViewFilter === 'MUTASI_TITIP_ONLY') {
      const filtered = rawPoints.filter((p) => p.isTitipMutation);
      if (filtered.length > 0) return filtered;
    }

    if (rawPoints.length === 0) {
      return [
        {
          pointIndex: 1,
          id: 'AWAL',
          tanggal: 'Awal',
          jam: '00:00',
          timeLabel: 'Awal',
          fullTime: 'Saldo Awal',
          jenis: 'Saldo Awal',
          keterangan: 'Belum ada transaksi mutasi',
          isTitipMutation: false,
          deltaTitip: 0,
          saldoTitip: statement.totalTitip || 0,
          saldoBon: statement.totalBonKeseluruhan || 0,
        },
      ];
    }

    return rawPoints;
  }, [statement, chartViewFilter]);

  const chartStats = useMemo(() => {
    if (!titipChartData || titipChartData.length === 0) {
      return { maxTitip: 0, minTitip: 0, totalTitipMutasi: 0, lastSaldo: 0 };
    }
    let max = 0;
    let min = Infinity;
    let titipMutasiCount = 0;
    titipChartData.forEach((p) => {
      if (p.saldoTitip > max) max = p.saldoTitip;
      if (p.saldoTitip < min) min = p.saldoTitip;
      if (p.isTitipMutation) titipMutasiCount++;
    });
    if (min === Infinity) min = 0;
    const lastSaldo = titipChartData[titipChartData.length - 1]?.saldoTitip || 0;
    return { maxTitip: max, minTitip: min, totalTitipMutasi: titipMutasiCount, lastSaldo };
  }, [titipChartData]);

  const handleResetCurrentMitra = async () => {
    if (!currentMitraId) return;
    setPartnerActionBusy(true);
    setErrorMsg('');
    try {
      const res = await api.resetSaldoMitra(currentMitraId);
      setConfirmResetOpen(false);
      setEditSuccessMsg(res.message);
      setTimeout(() => setEditSuccessMsg(''), 7000);
      await loadStatementData(currentMitraId, true);
      onRefreshParent?.();
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengosongkan saldo mitra');
    } finally {
      setPartnerActionBusy(false);
    }
  };

  const handleDeleteCurrentMitra = async () => {
    if (!currentMitraId) return;
    setPartnerActionBusy(true);
    setErrorMsg('');
    try {
      const nextMitra = mitraList.find((m) => m.id !== currentMitraId);
      await api.deleteMitra(currentMitraId);
      setConfirmDeleteOpen(false);
      onRefreshParent?.();
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
      if (nextMitra) {
        onSelectMitra(nextMitra.id);
      } else {
        setStatement(null);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghapus mitra');
    } finally {
      setPartnerActionBusy(false);
    }
  };

  const availableBanks = useMemo(
    () => rekeningList.filter((r) => !r.isVirtual && r.kode !== 'KAS01' && r.status === 'AKTIF'),
    [rekeningList]
  );

  const openModalUbahStatusNota = (opts: {
    idNota?: string;
    noNota?: string;
    nominal: number;
    targetNgunci: boolean;
    currentCatatan?: string;
  }) => {
    if (!statement) return;
    setToggleNgunciError('');
    setToggleNgunciTarget({
      idMitra: statement.idMitra,
      namaMitra: statement.namaMitra,
      idNota: opts.idNota,
      noNota: opts.noNota,
      nominal: opts.nominal,
      targetNgunci: opts.targetNgunci,
      currentCatatan: opts.currentCatatan ?? statement.catatanNgunci,
    });
  };

  const handleConfirmToggleNotaNgunci = async (catatanNgunci: string) => {
    if (!toggleNgunciTarget) return;
    setPartnerActionBusy(true);
    setToggleNgunciError('');
    setErrorMsg('');
    try {
      const res = await api.setStatusNotaNgunci({
        idMitra: toggleNgunciTarget.idMitra,
        idNota: toggleNgunciTarget.idNota,
        isNotaNgunci: toggleNgunciTarget.targetNgunci,
        catatanNgunci: catatanNgunci.trim() || undefined,
      });
      setToggleNgunciTarget(null);
      setEditSuccessMsg(res.message);
      setTimeout(() => setEditSuccessMsg(''), 6000);
      await loadStatementData(toggleNgunciTarget.idMitra, true);
      onRefreshParent?.();
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
    } catch (err: any) {
      setToggleNgunciError(err.message || 'Gagal memperbarui status Nota Kunci');
    } finally {
      setPartnerActionBusy(false);
    }
  };

  const openQuickPayModal = (opts?: {
    idNotaTarget?: string;
    noNotaLabel?: string;
    sisaNotaTarget?: number;
    isTargetNgunci?: boolean;
  }) => {
    if (!statement) return;
    const bonKotor = statement.totalBonKeseluruhan || 0;
    const titipAktif = statement.totalTitip || 0;
    const maksSinkron = Math.min(bonKotor, titipAktif);
    const selisihBonBersih = statement.sisaBonBersih ?? Math.max(0, bonKotor - titipAktif);

    let defaultMetode: 'TUNAI' | 'TRANSFER' | 'SINKRON' = 'TUNAI';
    let defaultNominal = selisihBonBersih > 0 ? selisihBonBersih : bonKotor;
    if (selisihBonBersih <= 0 && maksSinkron > 0) {
      defaultMetode = 'SINKRON';
      defaultNominal = maksSinkron;
    }

    const suggestedNominal =
      opts?.sisaNotaTarget && opts.sisaNotaTarget > 0
        ? Math.min(opts.sisaNotaTarget, defaultMetode === 'SINKRON' ? maksSinkron : bonKotor)
        : defaultNominal;

    setQuickPayMetode(defaultMetode);
    setQuickPayRekening(availableBanks[0]?.kode || 'BNI01');
    setQuickPayNominalInput(suggestedNominal > 0 ? String(suggestedNominal) : '');
    setQuickPayKeterangan(
      opts?.noNotaLabel
        ? `Pembayaran piutang nota ${opts.noNotaLabel}${opts.isTargetNgunci ? ' (Nota Kunci)' : ''}`
        : (statement.nominalNotaNgunci || 0) > 0
        ? `Pembayaran cicilan/pelunasan Nota Kunci mitra ${statement.namaMitra}`
        : `Pembayaran pelunasan piutang mitra ${statement.namaMitra}`
    );
    setQuickPayError('');
    setQuickPayModal({
      open: true,
      idNotaTarget: opts?.idNotaTarget,
      noNotaLabel: opts?.noNotaLabel,
      sisaNotaTarget: opts?.sisaNotaTarget,
      isTargetNgunci: opts?.isTargetNgunci,
    });
  };

  const handleSubmitQuickPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statement || !quickPayModal) return;
    const nominal = Math.round(Number(quickPayNominalInput) || 0);
    if (nominal <= 0) {
      setQuickPayError('Nominal pembayaran harus lebih dari Rp 0');
      return;
    }

    setQuickPayBusy(true);
    setQuickPayError('');
    try {
      const result = await api.processBayarBon({
        idMitra: statement.idMitra,
        nominalBayar: nominal,
        metode: quickPayMetode,
        rekeningTujuan:
          quickPayMetode === 'SINKRON'
            ? 'SINKRON'
            : quickPayMetode === 'TRANSFER'
            ? quickPayRekening
            : 'KAS01',
        keterangan: quickPayKeterangan.trim() || undefined,
        idNotaTarget: quickPayModal.idNotaTarget,
      });

      setQuickPayModal(null);
      await loadStatementData(statement.idMitra, true);
      onRefreshParent?.();
      window.dispatchEvent(new CustomEvent('erp:data-updated'));

      const pengurangKunci = result.nominalPengurangNotaNgunci || 0;
      const msgKunci =
        pengurangKunci > 0
          ? ` · Otomatis mengurangi Nominal Tidak Bisa Kembali sebesar ${formatRupiah(pengurangKunci)} (Sisa Nota Kunci: ${formatRupiah(result.sisaNotaNgunciSetelah || 0)})`
          : '';
      setEditSuccessMsg(
        `Pembayaran ${formatRupiah(result.nominalBayar)} berhasil dicatat (${result.idTransaksi})${msgKunci}`
      );
      setTimeout(() => setEditSuccessMsg(''), 8000);

      if (onSuccessReceipt) {
        const isResultSinkron = result.metode === 'SINKRON' || result.rekeningTujuan === 'SINKRON';
        const detailRows: ReceiptData['detailRows'] = [
          { label: 'Nama Mitra', value: result.namaMitra },
          {
            label: 'Metode Pembayaran',
            value: isResultSinkron
              ? 'SINKRON (Potong Titipan / Uang Hasil Bumi)'
              : `${result.metode} (${result.rekeningTujuan})`,
          },
          { label: 'Total Piutang Sebelum Bayar', value: result.totalBonSebelum },
          { label: 'Nominal Pembayaran Diterima', value: result.nominalBayar, isTotal: true },
          {
            label: 'Sisa Piutang Setelah Bayar',
            value: result.sisaBonSetelah,
            highlight: result.sisaBonSetelah > 0,
          },
        ];
        if (pengurangKunci > 0) {
          detailRows.push({
            label: 'Nominal Nota Kunci Sebelum Bayar',
            value: result.sisaNotaNgunciSebelum || pengurangKunci,
          });
          detailRows.push({
            label: 'Otomatis Mengurangi Uang Tidak Bisa Kembali',
            value: `- ${formatRupiah(pengurangKunci)}`,
          });
          detailRows.push({
            label: 'Sisa Nominal Nota Kunci Setelah Bayar',
            value: result.sisaNotaNgunciSetelah || 0,
          });
        }
        onSuccessReceipt({
          title: 'KUITANSI PEMBAYARAN PIUTANG MITRA',
          subtitle:
            pengurangKunci > 0
              ? 'Pembayaran Mitra Berstatus Nota Kunci — Otomatis Mengurangi Uang Tidak Bisa Kembali'
              : result.sisaBonSetelah === 0
              ? 'Status: LUNAS PENUH'
              : 'Status: PEMBAYARAN SEBAGIAN (ANGSURAN)',
          nomorTransaksi: result.idTransaksi,
          tanggal: result.tanggal,
          jam: result.jam,
          mitra: result.namaMitra,
          rekening: result.rekeningTujuan,
          kategori: 'BAYAR_BON',
          detailRows,
          catatan: result.keterangan,
          kasir: 'Kasir Wijaya Agro',
        });
      }
    } catch (err: any) {
      setQuickPayError(err.message || 'Gagal memproses pembayaran piutang');
    } finally {
      setQuickPayBusy(false);
    }
  };

  const loadStatementData = async (id: string, silent = false) => {
    if (!id) return;
    if (!silent && statement?.idMitra !== id) setLoading(true);
    setErrorMsg('');
    try {
      const data = await api.getRekeningKoranMitra(id);
      setStatement(data);
    } catch (err: any) {
      if (!silent) setErrorMsg(err.message || 'Gagal memuat rekening koran mitra');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentMitraId) return;
    loadStatementData(currentMitraId, false);
  }, [currentMitraId, profilPerusahaan?.updateTerakhir]);

  useEffect(() => {
    const onErpUpdated = () => {
      if (currentMitraId) {
        loadStatementData(currentMitraId, true);
      }
    };
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, [currentMitraId]);

  useEffect(() => {
    if (!profilPerusahaan) {
      api
        .getProfilPerusahaan()
        .then((res) => {
          if (res) setFetchedProfilFallback(res);
        })
        .catch(() => {});
    }
  }, [profilPerusahaan]);

  const activeProfil = useMemo<ProfilPerusahaan>(() => {
    const src = profilPerusahaan || statement?.profilPerusahaan || fetchedProfilFallback;
    const rawAlamat = src?.alamat?.trim();
    const rawTelp = src?.telepon?.trim();
    const rawEmail = src?.email?.trim();
    return {
      namaPerusahaan: src?.namaPerusahaan?.trim() || 'PT WIJAYA AGRO PERKASA',
      badanHukum: src?.badanHukum?.trim() || 'PT (Perseroan Terbatas)',
      alamat:
        rawAlamat && rawAlamat !== '-'
          ? rawAlamat
          : 'Jl Kalangan Desa Simpang Luas, Kec. Sungai Are, OKUS SUMSEL',
      telepon:
        rawTelp && rawTelp !== '-'
          ? rawTelp
          : 'KASIR 0821 44 999 305 | ADM 0812 2000 3305',
      email: rawEmail && rawEmail !== '-' ? rawEmail : 'wijayaagroperkasa@gmail.com',
      penanggungJawab: src?.penanggungJawab?.trim() || 'KASIR / ADM KEUANGAN',
      rekeningUtama: src?.rekeningUtama?.trim() || 'KAS01',
      catatanHeaderNota: src?.catatanHeaderNota?.trim() || '',
      updateTerakhir: src?.updateTerakhir,
    };
  }, [profilPerusahaan, statement?.profilPerusahaan, fetchedProfilFallback]);

  const activeRekeningUtama = useMemo(() => {
    const found = rekeningList.find((r) => r.kode === activeProfil.rekeningUtama);
    if (found) {
      return {
        kode: found.kode,
        nama: found.nama,
        nomorRekening: found.nomorRekening,
        atasNama: found.atasNama,
      };
    }
    return statement?.rekeningUtamaDetail;
  }, [rekeningList, activeProfil.rekeningUtama, statement?.rekeningUtamaDetail]);

  // Pisahkan Saldo Sedang Berjalan (Piutang & Titip belum cair/lunas) vs History Transaksi Selesai (Lunas & Cair)
  const historyBerjalanList = useMemo<RekeningKoranHistoryItem[]>(() => {
    if (!statement) return [];
    if (Array.isArray(statement.historySaldoBerjalan)) {
      return statement.historySaldoBerjalan;
    }
    return (statement.history || []).filter((h) => h.isSaldoBerjalan !== false);
  }, [statement]);

  const historySelesaiList = useMemo<RekeningKoranHistoryItem[]>(() => {
    if (!statement) return [];
    if (Array.isArray(statement.historySelesai)) {
      return statement.historySelesai;
    }
    return (statement.history || []).filter((h) => h.isSaldoBerjalan === false);
  }, [statement]);

  const displayedRows = ledgerTab === 'SALDO_BERJALAN' ? historyBerjalanList : historySelesaiList;

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    const nom = Number(editNominalInput);
    if (!nom || nom <= 0) {
      setEditErrorMsg('Nominal transaksi harus lebih dari Rp 0');
      return;
    }

    setSavingEdit(true);
    setEditErrorMsg('');
    setEditSuccessMsg('');
    try {
      await api.updateStatementEntry({
        idTransaksi: editingEntry.id,
        nominalBaru: nom,
        tanggalBaru: editTanggalInput.trim() || undefined,
        keteranganBaru: editKeteranganInput.trim() || undefined,
      });

      setEditSuccessMsg('Transaksi berhasil disinkronkan & nominal nego diperbarui!');
      setTimeout(() => {
        setEditingEntry(null);
        if (currentMitraId) loadStatementData(currentMitraId);
        if (onRefreshParent) onRefreshParent();
      }, 700);
    } catch (err: any) {
      setEditErrorMsg(err.message || 'Gagal memperbarui transaksi');
    } finally {
      setSavingEdit(false);
    }
  };

  const handlePrintClick = () => {
    if (!statement) {
      if (currentMitraId) {
        setLoading(true);
        api
          .getRekeningKoranMitra(currentMitraId)
          .then((data) => {
            setStatement(data);
            setShowPrintModal(true);
          })
          .catch((err) => {
            setErrorMsg(err.message || 'Gagal memuat rekening koran');
          })
          .finally(() => setLoading(false));
      }
      return;
    }
    setShowPrintModal(true);
  };

  const handleQuickCopy = () => {
    if (!statement) return;
    const lines = [
      `*REKENING KORAN MITRA - ${activeProfil.namaPerusahaan}*`,
      `Alamat PT: ${activeProfil.alamat} | Telp: ${activeProfil.telepon}`,
      `Mitra: ${statement.namaMitra} (${statement.kodeMitra}) - ${statement.role}`,
      `Total Kasbon Barang: ${formatRupiah(statement.totalKasbonBarang)}`,
      `Total Kasbon Uang: ${formatRupiah(statement.totalKasbonUang)}`,
      `*TOTAL SISA BON: ${formatRupiah(statement.totalBonKeseluruhan)}*`,
      `Titip Hasil Bumi: ${formatRupiah(statement.totalTitip)}`,
      `Jumlah Riwayat Transaksi: ${statement.history.length}`,
      `Penanggung Jawab: ${activeProfil.penanggungJawab}`,
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setQuickCopied(true);
      setTimeout(() => setQuickCopied(false), 2500);
    });
  };

  const now = new Date();
  const tglCetak = formatTanggalIndo(now.toISOString().split('T')[0]);
  const jamCetak = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
              Rekening Koran / Buku Besar Kasbon Mitra
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
              MODUL 8
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Rekap mutasi kasbon barang (pupuk/obat), kasbon uang tunai, setoran panen, dan pelunasan bon dengan kolom kuantitas (Qty) &amp; harga satuan
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Layout Mode Selector */}
          <div className="flex items-center bg-zinc-100 p-1 rounded-lg border border-zinc-200 text-xs">
            <button
              onClick={() => setViewMode('TABEL')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                viewMode === 'TABEL'
                  ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              <span>Tampilan Tabel</span>
            </button>
            <button
              onClick={() => setViewMode('LEMBAR_CETAK')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                viewMode === 'LEMBAR_CETAK'
                  ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Format Lembar Cetak A4</span>
            </button>
          </div>

          {/* Button to view visual sample mockup */}
          <button
            onClick={() => setShowMockupPreview(!showMockupPreview)}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
            title="Lihat cuplikan gambar contoh rekening koran mitra / format backup harian"
          >
            <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
            <span>{showMockupPreview ? 'Tutup Cuplikan' : 'Cuplikan Dokumen Fisik'}</span>
          </button>

          {statement && (
            <button
              onClick={handleQuickCopy}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Salin rekap ringkas ke clipboard"
            >
              {quickCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-zinc-500" />}
              <span>{quickCopied ? 'Tersalin!' : 'Salin Rekap'}</span>
            </button>
          )}

          <button
            onClick={() => setModalPinjamUangOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            title="Catat penerimaan pinjaman dana dari mitra ini ke kas PT (otomatis masuk ke saldo titip mitra)"
          >
            <HandCoins className="w-4 h-4 text-emerald-200" />
            <span>+ Pinjam Uang PT ke Mitra</span>
          </button>

          <button
            onClick={() => setModalBersihkanNotaOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
            title="Bersihkan bukti nota lalu berdasarkan nama atau waktu (otomatis memperbarui rekening mitra ini)"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Bersihkan Bukti Nota</span>
          </button>

          {statement && (
            <button
              type="button"
              onClick={() => setShareModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Bagikan link publik khusus ke mitra/user lain (Hanya Baca / Read-Only)"
            >
              <Share2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Bagikan Link Mitra</span>
            </button>
          )}

          <button
            onClick={handlePrintClick}
            disabled={loading}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>{loading ? 'Memuat Data...' : 'Cetak & PDF'}</span>
          </button>
        </div>
      </div>

      {/* Visual Sample Mockup Drawer / Card */}
      {showMockupPreview && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 sm:p-5 relative animate-in fade-in duration-200">
          <button
            onClick={() => setShowMockupPreview(false)}
            className="absolute top-3 right-3 text-amber-800 hover:text-amber-950 p-1 rounded-md hover:bg-amber-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-col md:flex-row gap-5 items-start">
            <div className="md:w-80 shrink-0">
              <div className="rounded-lg overflow-hidden border border-amber-300 shadow-sm bg-white">
                <img
                  src={rekeningKoranMockupImg}
                  alt="Cuplikan Contoh Format Rekening Koran Mitra Harian"
                  className="w-full h-auto object-cover max-h-56"
                />
              </div>
              <span className="block text-[10px] text-amber-800/80 mt-1 text-center font-medium">
                Cuplikan Rekening Koran / Lembar Mutasi Harian
              </span>
            </div>

            <div className="space-y-2 text-xs text-amber-950">
              <h3 className="font-bold text-sm text-amber-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-700" />
                Format Rekening Koran Mitra Harian &amp; Kolom Quantity (Qty)
              </h3>
              <p className="text-zinc-700 leading-relaxed">
                Format tata letak di bawah ini telah disesuaikan agar persis menyerupai buku besar mutasi harian dan rekening koran fisik:
              </p>
              <ul className="list-disc list-inside space-y-1 text-zinc-700">
                <li>
                  <strong>Kop Surat &amp; Identitas Mitra:</strong> Mengambil otomatis dari menu Profil Perusahaan ({activeProfil.namaPerusahaan}), alamat, telepon, email, beserta identitas mitra petani.
                </li>
                <li>
                  <strong>Kolom Qty (Kuantitas) &amp; Harga Satuan:</strong> Kasbon barang toko (pupuk/obat) menampilkan jumlah sak/botol/kg beserta harga satuan. Untuk kasbon uang tunai, otomatis terisi <strong>Qty: 1 Trx</strong> dengan harga satuan nominal uang.
                </li>
                <li>
                  <strong>Debet (+) &amp; Kredit (-):</strong> Mutasi kasbon bertambah di kolom Debet, dan pembayaran/potongan hasil panen mengurangi di kolom Kredit.
                </li>
                <li>
                  <strong>Kolom Tanda Tangan:</strong> Pengesahan resmi dua arah antara Bagian Keuangan / Kasir dan Mitra Petani penerima.
                </li>
              </ul>
              <div className="pt-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setViewMode('LEMBAR_CETAK')}
                  className="text-xs bg-amber-700 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-800 transition-colors shadow-2xs"
                >
                  Beralih ke Format Lembar Cetak A4 Sekarang
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Identitas Perusahaan Penerbit (Dinamis & Otomatis dari Menu Profil Perusahaan) */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span className="font-bold text-sm text-zinc-900 tracking-tight">
                {activeProfil.namaPerusahaan}
              </span>
              <span className="text-zinc-300" aria-hidden="true">·</span>
              <span className="text-zinc-600 font-medium">{activeProfil.badanHukum}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-zinc-600">
              <span>{activeProfil.alamat}</span>
              <span className="text-zinc-300" aria-hidden="true">·</span>
              <span>Telp/WA: <strong className="font-mono text-zinc-800">{activeProfil.telepon}</strong></span>
              {activeProfil.email && activeProfil.email !== '-' && (
                <>
                  <span className="text-zinc-300" aria-hidden="true">·</span>
                  <span>Email: <strong className="text-zinc-800">{activeProfil.email}</strong></span>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-zinc-500">
              <span>Penanggung Jawab: <strong className="text-zinc-700">{activeProfil.penanggungJawab}</strong></span>
              {activeRekeningUtama && (
                <>
                  <span className="text-zinc-300" aria-hidden="true">·</span>
                  <span>
                    Rekening Utama: <strong className="font-mono text-zinc-700">{activeRekeningUtama.nama}</strong>
                    {activeRekeningUtama.nomorRekening ? ` (${activeRekeningUtama.nomorRekening})` : ` (${activeRekeningUtama.kode})`}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {onOpenProfilPerusahaan && (
          <button
            type="button"
            onClick={onOpenProfilPerusahaan}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer shrink-0 self-start lg:self-center"
            title="Ubah data Profil Perusahaan (otomatis memperbarui Kop Surat & Detail Rekening Koran Mitra)"
          >
            <Pencil className="w-3.5 h-3.5 text-emerald-700" />
            <span>Sesuaikan Profil Perusahaan</span>
          </button>
        )}
      </div>

      {/* Select Mitra Card */}
      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <label className="block text-xs font-bold text-zinc-700 mb-1 uppercase tracking-wider">
            Pilih Nama Mitra / Petani:
          </label>
          <select
            value={currentMitraId}
            onChange={(e) => onSelectMitra(e.target.value)}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-600 bg-white"
          >
            {mitraList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nama} ({m.kode}) -{' '}
                {getRoleMitraLabel(m.role, {
                  isAnakPerusahaan: m.isAnakPerusahaan,
                  isKaryawan: m.isKaryawan,
                })}{' '}
                - {m.telepon}
              </option>
            ))}
          </select>
        </div>

        {statement && (() => {
          const sTotalBon = statement.totalBonKeseluruhan || 0;
          const sNomKunci = statement.nominalNotaNgunci || 0;
          const sNomPiutangAktif =
            statement.nominalPiutangAktif ?? Math.max(0, sTotalBon - sNomKunci);
          const sNomHutang = statement.totalTitip || 0;
          const sPiutangBanding =
            sNomPiutangAktif > 0
              ? sNomPiutangAktif
              : sNomHutang > 0 && sTotalBon > 0
                ? sTotalBon
                : 0;
          const sAdaDuaSisi = sTotalBon > 0 && sNomHutang > 0;
          const sStatusLabel =
            sPiutangBanding > sNomHutang
              ? 'PIUTANG'
              : sNomHutang > sPiutangBanding
                ? 'HUTANG'
                : sPiutangBanding > 0 && sNomHutang > 0
                  ? 'SEIMBANG'
                  : sNomKunci > 0 || statement.isNotaNgunci
                    ? 'NGUNCI'
                    : 'LUNAS';
          const sStatusColor =
            sStatusLabel === 'PIUTANG'
              ? 'text-amber-800'
              : sStatusLabel === 'HUTANG'
                ? 'text-purple-800'
                : sStatusLabel === 'SEIMBANG'
                  ? 'text-sky-800'
                  : sStatusLabel === 'NGUNCI'
                    ? 'text-rose-800'
                    : 'text-emerald-700';

          return (
            <div className="flex flex-col sm:items-end gap-2">
              <div className="text-xs text-zinc-600 sm:text-right space-y-0.5">
                <div>
                  Status Rekening:{' '}
                  <strong className={`${sStatusColor} font-extrabold uppercase`}>
                    {sStatusLabel}
                  </strong>
                  {sAdaDuaSisi ? ' (Ada Piutang & Hutang)' : ''} ·{' '}
                  {getRoleMitraLabel(statement.role, {
                    isAnakPerusahaan: statement.isAnakPerusahaan,
                    isKaryawan: statement.isKaryawan,
                  })}
                </div>
                <div>
                  Alamat: <span className="text-zinc-800 font-medium">{statement.alamat || '-'}</span>
                </div>
                <div>
                  Kontak HP/WA: <span className="font-mono text-zinc-800">{statement.telepon || '-'}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {sAdaDuaSisi && (
                  <button
                    type="button"
                    onClick={() => setKliringModalOpen(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors cursor-pointer shadow-2xs"
                    title="Kliring Silang Otomatis Piutang vs Hutang pada akun mitra ini"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Kliring Silang</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmResetOpen(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors cursor-pointer"
                  title="Kosongkan seluruh saldo, bon, piutang & titipan mitra ini ke Rp 0"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                  <span>Kosongkan Saldo Mitra</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-lg transition-colors cursor-pointer"
                  title="Hapus data mitra ini dari sistem"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Hapus Mitra</span>
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {editSuccessMsg && !editingEntry && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between gap-2 font-medium">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{editSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setEditSuccessMsg('')}
            className="text-emerald-700 hover:text-emerald-950 px-1.5 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading && (
        <div className="py-12 text-center text-zinc-400 text-xs flex items-center justify-center space-x-2">
          <div className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full" />
          <span>Memuat data rekening koran...</span>
        </div>
      )}

      {statement && !loading && (
        <div className="space-y-6">
          {/* Panel Standar Status Nota (Nota Aktif: 1. Piutang & 2. Hutang | 3. Ngunci) & Aksi Rekening Mitra */}
          {(() => {
            const nomKunci = statement.nominalNotaNgunci || 0;
            const nomPiutangAktif =
              statement.nominalPiutangAktif ??
              Math.max(0, (statement.totalBonKeseluruhan || 0) - nomKunci);
            const nomHutangPt = statement.totalTitip || 0;
            const totalRekeningMitraNotaSupplier = nomPiutangAktif - nomHutangPt;
            const hasKunci = nomKunci > 0 || Boolean(statement.isNotaNgunci);
            const hasPiutangAktif = nomPiutangAktif > 0;
            const hasHutangAktif = nomHutangPt > 0;
            const isNotaAktif = hasPiutangAktif || hasHutangAktif;

            return (
              <>
                <div
                  className={`rounded-xl p-4 sm:p-5 border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                    hasKunci
                      ? 'bg-rose-50/75 border-rose-200'
                      : isNotaAktif
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : 'bg-zinc-50 border-zinc-200'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-bold">
                      {isNotaAktif && (
                        <span className="inline-flex items-center gap-1 text-emerald-800">
                          <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span>NOTA AKTIF (BERJALAN)</span>
                        </span>
                      )}
                      {hasPiutangAktif && (
                        <span className="text-amber-900">
                          1. Piutang (Mitra Berhutang):{' '}
                          <strong className="font-mono tabular-nums">{formatRupiah(nomPiutangAktif)}</strong>
                        </span>
                      )}
                      {hasHutangAktif && (
                        <span className="text-purple-900">
                          2. Hutang (PT Berhutang: Uang Titip &amp; HB Titip):{' '}
                          <strong className="font-mono tabular-nums">{formatRupiah(nomHutangPt)}</strong>
                        </span>
                      )}
                      {hasKunci && (
                        <span className="inline-flex items-center gap-1 text-rose-800">
                          <Lock className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                          <span>
                            3. Ngunci:{' '}
                            <strong className="font-mono tabular-nums">{formatRupiah(nomKunci)}</strong>
                          </span>
                        </span>
                      )}
                      {!isNotaAktif && !hasKunci && (
                        <span className="text-zinc-600">STATUS NOTA: LUNAS / IMPAS (Rp 0)</span>
                      )}
                    </div>

                    <p className={`text-[11px] leading-relaxed ${hasKunci ? 'text-rose-900/90' : 'text-zinc-600'}`}>
                      {hasKunci ? (
                        <>
                          <strong>Status Nota 3. Ngunci</strong> tidak dilibatkan dalam rumus <strong>Total Rekening Mitra / Nota Supplier</strong>. Status Ngunci hanya berguna apabila mitra terkait melakukan pembayaran (otomatis mengurangi nominal Ngunci).
                          {statement.catatanNgunci ? ` Kronologi: ${statement.catatanNgunci}` : ''}
                        </>
                      ) : (
                        <>
                          <strong>Nota Aktif</strong> mencakup nota yang masih berjalan baik <strong>1. Piutang (Mitra Berhutang)</strong> maupun <strong>2. Hutang (PT Berhutang: Uang Titip &amp; HB Titip)</strong>. Rumus Total Rekening Mitra / Nota Supplier hanya mengurangkan Jumlah Piutang dengan Jumlah Hutang.
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {nomHutangPt > 0 && (
                      <button
                        type="button"
                        disabled={partnerActionBusy}
                        onClick={() => {
                          setKliringInitialMode('AMBIL_UANG_DULU');
                          setKliringModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                        title="Mitra mengambil uang titipan dulu dengan input nominal bebas tanpa memotong bon (Piutang tetap)"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        <span>
                          Ambil Uang Titipan ({formatRupiahSingkat(nomHutangPt)})
                        </span>
                      </button>
                    )}

                    {statement.totalBonKeseluruhan > 0 && nomHutangPt > 0 && (
                      <button
                        type="button"
                        disabled={partnerActionBusy}
                        onClick={() => {
                          setKliringInitialMode('KLIRING_SILANG');
                          setKliringModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                        title="Kliring silang untuk angsur atau lunasi piutang bon dari saldo titipan"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>
                          Kliring Silang ({formatRupiahSingkat(Math.min(statement.totalBonKeseluruhan, nomHutangPt))})
                        </span>
                      </button>
                    )}

                    {statement.totalBonKeseluruhan > 0 && (
                      <button
                        type="button"
                        disabled={partnerActionBusy}
                        onClick={() => openQuickPayModal()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                      >
                        <HandCoins className="w-3.5 h-3.5" />
                        <span>
                          {hasKunci
                            ? '+ Terima Pembayaran (Kurangi Ngunci)'
                            : '+ Terima Pembayaran Piutang'}
                        </span>
                      </button>
                    )}

                    {hasPiutangAktif && (
                      <button
                        type="button"
                        disabled={partnerActionBusy}
                        onClick={() =>
                          openModalUbahStatusNota({
                            nominal: nomPiutangAktif,
                            targetNgunci: true,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>
                          {hasKunci
                            ? 'Ubah Sisa Piutang Jadi Ngunci'
                            : 'Ubah Status Piutang Jadi Ngunci'}
                        </span>
                      </button>
                    )}

                    {hasKunci && (
                      <button
                        type="button"
                        disabled={partnerActionBusy}
                        onClick={() =>
                          openModalUbahStatusNota({
                            nominal: nomKunci,
                            targetNgunci: false,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Pulihkan ke 1. Piutang Aktif</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Summary Balance Cards (Standar 1. Piutang, 2. Hutang, Total Rekening Mitra/Nota Supplier, 3. Ngunci) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: 1. Piutang (Mitra Berhutang) */}
                  <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 shadow-2xs min-w-0 overflow-hidden">
                    <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block truncate">
                      1. PIUTANG (MITRA BERHUTANG)
                    </span>
                    <div
                      className="text-xl font-black text-amber-950 mt-1 font-mono tabular-nums truncate whitespace-nowrap"
                      title={formatRupiah(nomPiutangAktif)}
                    >
                      {formatRupiahSingkat(nomPiutangAktif)}
                    </div>
                    <div className="text-[11px] text-amber-800/90 mt-1 truncate">
                      Barang {formatRupiahSingkat(statement.totalKasbonBarang)} · Uang {formatRupiahSingkat(statement.totalKasbonUang)} (Aktif)
                    </div>
                  </div>

                  {/* Card 2: 2. Hutang (PT Berhutang: Uang Titip & HB Titip) */}
                  <div className="bg-purple-50/70 p-4 rounded-xl border border-purple-200 shadow-2xs min-w-0 overflow-hidden">
                    <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider block truncate">
                      2. HUTANG (PT BERHUTANG)
                    </span>
                    <div
                      className="text-xl font-black text-purple-950 mt-1 font-mono tabular-nums truncate whitespace-nowrap"
                      title={formatRupiah(nomHutangPt)}
                    >
                      {formatRupiahSingkat(nomHutangPt)}
                    </div>
                    <div className="text-[11px] text-purple-800 font-medium mt-1 truncate">
                      {statement.isKaryawan
                        ? 'Uang titip + HB titip + upah belum cair'
                        : 'Termasuk Uang Titip & HB Titip'}
                    </div>
                  </div>

                  {/* Card 3: YANG HARUS DIBAYAR (Selisih Piutang vs Hutang/Titip walau belum kliring) */}
                  <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-300 shadow-2xs min-w-0 overflow-hidden">
                    <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider block truncate">
                      YANG HARUS DIBAYAR (SELISIH AKTIF)
                    </span>
                    <div
                      className={`text-xl font-black mt-1 font-mono tabular-nums truncate whitespace-nowrap ${
                        totalRekeningMitraNotaSupplier > 0
                          ? 'text-rose-900'
                          : totalRekeningMitraNotaSupplier < 0
                            ? 'text-emerald-900'
                            : 'text-zinc-900'
                      }`}
                      title={
                        totalRekeningMitraNotaSupplier < 0
                          ? `HUTANG PT KE MITRA: ${formatRupiah(Math.abs(totalRekeningMitraNotaSupplier))}`
                          : totalRekeningMitraNotaSupplier > 0
                            ? `PIUTANG MITRA KE PT: ${formatRupiah(totalRekeningMitraNotaSupplier)}`
                            : 'IMPAS (Rp 0)'
                      }
                    >
                      {totalRekeningMitraNotaSupplier < 0
                        ? `Hutang ${formatRupiahSingkat(Math.abs(totalRekeningMitraNotaSupplier))}`
                        : totalRekeningMitraNotaSupplier > 0
                          ? `Piutang ${formatRupiahSingkat(totalRekeningMitraNotaSupplier)}`
                          : 'Impas Rp 0'}
                    </div>
                    <div className="text-[11px] text-emerald-800 font-medium mt-1 truncate">
                      {totalRekeningMitraNotaSupplier < 0
                        ? 'Hutang PT ke Mitra (2. Hutang − 1. Piutang)'
                        : totalRekeningMitraNotaSupplier > 0
                          ? 'Piutang Mitra ke PT (1. Piutang − 2. Hutang)'
                          : 'Piutang & Titip seimbang (Tanpa Ngunci)'}
                    </div>
                  </div>

                  {/* Card 4: 3. Ngunci */}
                  <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-2xs min-w-0 overflow-hidden">
                    <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block truncate">
                      3. NGUNCI (TAK KEMBALI)
                    </span>
                    <div
                      className="text-xl font-black text-rose-800 mt-1 font-mono tabular-nums truncate whitespace-nowrap"
                      title={formatRupiah(nomKunci)}
                    >
                      {formatRupiahSingkat(nomKunci)}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1 truncate">
                      Hanya berkurang otomatis jika mitra membayar
                    </div>
                  </div>
                </div>
              </>
            );
          })()}

          {/* PANEL REKAP TERPADU: KARYAWAN SEKALIGUS MITRA (GAJI + TITIP PANEN + KASBON) */}
          {(statement.isKaryawan || statement.role === 'KARYAWAN') && (
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    Rekening Terpadu Karyawan &amp; Mitra: {statement.namaMitra}
                    {statement.nikKaryawan ? ` (${statement.nikKaryawan})` : ''}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {statement.jabatanKaryawan ? `${statement.jabatanKaryawan} · Divisi ${statement.divisiKaryawan || '-'} · ` : ''}
                    Seluruh hak gaji/upah kerja, riwayat pencairan slip gaji, kasbon, serta uang titip hasil panen terekap utuh dalam satu rekening ini.
                  </p>
                </div>

                {onNavigateToBayarGaji && (
                  <button
                    type="button"
                    onClick={() => onNavigateToBayarGaji(statement.idKaryawanTerkait)}
                    className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer shrink-0 self-start sm:self-center"
                  >
                    Bayar Gaji Karyawan →
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 bg-white rounded-lg border border-slate-200 space-y-1">
                  <div className="text-[10px] font-bold text-purple-900 uppercase tracking-wider">
                    Saldo Titip Hasil Panen
                  </div>
                  <div className="text-base font-black text-purple-900 font-mono tabular-nums">
                    {formatRupiah(statement.totalTitipPanenMurni ?? 0)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Hasil panen titip belum cair
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-lg border border-slate-200 space-y-1">
                  <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                    Hak Gaji / Upah Belum Cair
                  </div>
                  <div className="text-base font-black text-amber-800 font-mono tabular-nums">
                    {formatRupiah(statement.totalUpahBelumDibayar ?? 0)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Akumulasi kerja tercatat belum dibayar
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-lg border border-slate-200 space-y-1">
                  <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                    Riwayat Gaji Sudah Cair
                  </div>
                  <div className="text-base font-black text-emerald-700 font-mono tabular-nums">
                    {formatRupiah(statement.totalGajiSudahDibayar ?? 0)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Total gaji lunas yang sudah dibayarkan
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-lg border border-emerald-300 space-y-1">
                  <div className="text-[10px] font-bold text-slate-800 uppercase tracking-wider">
                    Total Hak Belum Cair (Titip + Upah)
                  </div>
                  <div className="text-base font-black text-slate-900 font-mono tabular-nums">
                    {formatRupiah(statement.totalTitip)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Sebelum dikurangi bon {formatRupiah(statement.totalBonKeseluruhan)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PANEL INTEGRASI 1 TRANSAKSI TERPADU: ANAK PERUSAHAAN & REKENING (DP PARABOT <-> REK-DPPARABO) */}
          {(statement.isAnakPerusahaan || statement.role === 'ANAK_PERUSAHAAN') && (
            <div className="bg-teal-50/60 border border-teal-300 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-800 text-white flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-teal-950">
                      Integrasi 1 Transaksi Terpadu: {statement.namaMitra} ↔ Master Rekening ({statement.kodeRekeningTerkait || 'REK-DPPARABO'})
                    </div>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {statement.namaMitra} merupakan Anak Perusahaan {activeProfil.namaPerusahaan} sekaligus Mitra. Setiap mutasi pada rekening{' '}
                      <strong className="font-mono text-teal-900">{statement.kodeRekeningTerkait || 'REK-DPPARABO'}</strong>{' '}
                      dan transaksi kemitraan tersimpan otomatis menjadi satu transaksi yang sama di Cloud Supabase.
                    </p>
                  </div>
                </div>

                {rekeningList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAnakPerusahaanModalOpen(true)}
                    className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors cursor-pointer shrink-0 self-start sm:self-center"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>Simpan / Tarik Dana Terpadu</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 bg-white rounded-lg border border-teal-200 space-y-1 min-w-0 overflow-hidden">
                  <div className="text-[10px] font-bold text-teal-900 uppercase tracking-wider truncate">
                    Saldo Rekening {statement.kodeRekeningTerkait || 'REK-DPPARABO'}
                  </div>
                  <div
                    className={`text-lg font-black font-mono tabular-nums truncate whitespace-nowrap ${
                      (statement.saldoRekeningAnakPerusahaan || 0) >= 0 ? 'text-teal-900' : 'text-rose-700'
                    }`}
                    title={formatRupiah(statement.saldoRekeningAnakPerusahaan || 0)}
                  >
                    {formatRupiahSingkat(statement.saldoRekeningAnakPerusahaan || 0)}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {(statement.saldoRekeningAnakPerusahaan || 0) > 0
                      ? 'Dana PT tersimpan di Anak Perusahaan'
                      : (statement.saldoRekeningAnakPerusahaan || 0) < 0
                      ? 'Talangan Anak Perusahaan ke PT'
                      : 'Saldo rekening saat ini impas'}
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-lg border border-zinc-200 space-y-1 min-w-0 overflow-hidden">
                  <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider truncate">
                    Total Simpan / Masuk Rekening
                  </div>
                  <div
                    className="text-lg font-bold text-emerald-800 font-mono tabular-nums truncate whitespace-nowrap"
                    title={formatRupiah(statement.totalSimpanKeAnakPerusahaan || 0)}
                  >
                    {formatRupiahSingkat(statement.totalSimpanKeAnakPerusahaan || 0)}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    Akumulasi dana PT masuk ke {statement.kodeRekeningTerkait || 'REK-DPPARABO'}
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-lg border border-zinc-200 space-y-1 min-w-0 overflow-hidden">
                  <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider truncate">
                    Total Pakai / Keluar Rekening
                  </div>
                  <div
                    className="text-lg font-bold text-amber-800 font-mono tabular-nums truncate whitespace-nowrap"
                    title={formatRupiah(statement.totalPakaiDariAnakPerusahaan || 0)}
                  >
                    {formatRupiahSingkat(statement.totalPakaiDariAnakPerusahaan || 0)}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    Akumulasi penarikan &amp; pembayaran via {statement.kodeRekeningTerkait || 'REK-DPPARABO'}
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-lg border border-teal-300 space-y-1 min-w-0 overflow-hidden">
                  <div className="text-[10px] font-bold text-zinc-800 uppercase tracking-wider truncate">
                    Posisi Bersih Terpadu
                  </div>
                  <div
                    className={`text-lg font-black font-mono tabular-nums truncate whitespace-nowrap ${
                      (statement.posisiBersihTerpadu || 0) > 0
                        ? 'text-purple-900'
                        : (statement.posisiBersihTerpadu || 0) < 0
                        ? 'text-teal-900'
                        : 'text-emerald-800'
                    }`}
                    title={formatRupiah(Math.abs(statement.posisiBersihTerpadu || 0))}
                  >
                    {formatRupiahSingkat(Math.abs(statement.posisiBersihTerpadu || 0))}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {(statement.posisiBersihTerpadu || 0) > 0
                      ? `PT berhutang bersih ke ${statement.namaMitra}`
                      : (statement.posisiBersihTerpadu || 0) < 0
                      ? `Dana bersih PT pada ${statement.namaMitra}`
                      : 'Posisi gabungan lunas / impas'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* GRAFIK RECHARTS: FLUKTUASI SALDO TITIPAN MITRA DARI WAKTU KE WAKTU */}
          <div className="bg-white rounded-xl border border-purple-200/90 shadow-2xs overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-purple-50/70 via-indigo-50/40 to-white border-b border-purple-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-700 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-900 flex items-center gap-2">
                    <span>Grafik Fluktuasi Saldo Titipan Mitra dari Waktu ke Waktu</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold border border-purple-200">
                      Visual Recharts
                    </span>
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Pergerakan akumulasi dana titipan ({statement.namaMitra}) berdasarkan histori panen &amp; pinjaman PT
                  </p>
                </div>
              </div>

              {/* Chart Controls & Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center space-x-1.5 bg-white border border-purple-200 px-2.5 py-1 rounded-lg text-[11px]">
                  <span className="text-zinc-500">Puncak Titip:</span>
                  <strong
                    className="text-purple-900 font-mono tabular-nums font-bold whitespace-nowrap"
                    title={formatRupiah(chartStats.maxTitip)}
                  >
                    {formatRupiahSingkat(chartStats.maxTitip)}
                  </strong>
                </div>

                <div className="flex items-center space-x-1.5 bg-white border border-zinc-200 px-2 py-1 rounded-lg text-[11px]">
                  <span className="text-zinc-500">Filter:</span>
                  <select
                    value={chartViewFilter}
                    onChange={(e) => setChartViewFilter(e.target.value as any)}
                    className="bg-transparent font-semibold text-zinc-800 focus:outline-none cursor-pointer"
                  >
                    <option value="SEMUA">Semua Transaksi ({titipChartData.length})</option>
                    <option value="MUTASI_TITIP_ONLY">Hanya Mutasi Titip</option>
                  </select>
                </div>

                <label className="flex items-center space-x-1.5 bg-white border border-zinc-200 px-2.5 py-1 rounded-lg text-[11px] cursor-pointer select-none text-zinc-700 hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    checked={chartIncludeBon}
                    onChange={(e) => setChartIncludeBon(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-0"
                  />
                  <span>Garis Saldo Bon</span>
                </label>

                <button
                  type="button"
                  onClick={() => setShowTitipChart(!showTitipChart)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors cursor-pointer flex items-center space-x-1"
                >
                  {showTitipChart ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Sembunyikan</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Tampilkan Grafik</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Recharts Container */}
            {showTitipChart && (
              <div className="p-4 sm:p-5 space-y-3">
                <div className="w-full h-64 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={titipChartData}
                      margin={{ top: 12, right: 25, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="timeLabel"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        stroke="#cbd5e1"
                      />
                      <YAxis
                        tickFormatter={(val) => {
                          if (val >= 1000000) return `${(val / 1000000).toFixed(1)}jt`;
                          if (val >= 1000) return `${(val / 1000).toFixed(0)}rb`;
                          return `${val}`;
                        }}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        stroke="#cbd5e1"
                        width={50}
                      />
                      <RechartsTooltip
                        content={({ active, payload }: any) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-zinc-900 text-white text-xs p-3 rounded-xl shadow-2xl border border-zinc-700 space-y-1.5 max-w-xs z-50 animate-in fade-in zoom-in-95">
                                <div className="flex items-center justify-between border-b border-zinc-800 pb-1 text-[10px]">
                                  <span className="font-mono text-zinc-300">
                                    {data.tanggal} {data.jam}
                                  </span>
                                  <span className="font-mono font-bold text-amber-300 bg-zinc-800 px-1.5 py-0.2 rounded border border-zinc-700">
                                    {data.id}
                                  </span>
                                </div>
                                <div className="font-semibold text-zinc-100 text-[11px] leading-tight">
                                  {data.jenis}
                                </div>
                                {data.keterangan && data.keterangan !== '-' && (
                                  <div className="text-[10px] text-zinc-400 line-clamp-2">
                                    {data.keterangan}
                                  </div>
                                )}
                                <div className="pt-1.5 border-t border-zinc-800 space-y-1">
                                  <div className="flex justify-between items-center text-[11px]">
                                    <span className="text-purple-300 font-medium">Saldo Titipan:</span>
                                    <span className="font-mono font-black text-purple-200">
                                      {formatRupiah(data.saldoTitip)}
                                    </span>
                                  </div>
                                  {data.perubahanTitip !== 0 && (
                                    <div className="flex justify-between items-center text-[10px]">
                                      <span className="text-zinc-400">Mutasi Titip:</span>
                                      <span
                                        className={`font-mono font-bold ${
                                          data.perubahanTitip > 0 ? 'text-emerald-400' : 'text-rose-400'
                                        }`}
                                      >
                                        {data.perubahanTitip > 0
                                          ? `+${formatRupiah(data.perubahanTitip)}`
                                          : formatRupiah(data.perubahanTitip)}
                                      </span>
                                    </div>
                                  )}
                                  {chartIncludeBon && (
                                    <div className="flex justify-between items-center text-[10px]">
                                      <span className="text-amber-300 font-medium">Saldo Bon Mitra:</span>
                                      <span className="font-mono font-bold text-amber-200">
                                        {formatRupiah(data.saldoBon)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }}
                      />
                      <Line
                        type="monotone"
                        name="Saldo Titipan Mitra (Rp)"
                        dataKey="saldoTitip"
                        stroke="#7e22ce"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#7e22ce', stroke: '#fff', strokeWidth: 1.5 }}
                        activeDot={{ r: 6, fill: '#581c87', stroke: '#fff', strokeWidth: 2 }}
                      />
                      {chartIncludeBon && (
                        <Line
                          type="monotone"
                          name="Saldo Bon Mitra (Rp)"
                          dataKey="saldoBon"
                          stroke="#d97706"
                          strokeWidth={1.75}
                          strokeDasharray="4 4"
                          dot={{ r: 2.5, fill: '#d97706' }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Footnote information */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 pt-1 border-t border-zinc-100">
                  <div className="flex items-center space-x-3">
                    <span className="flex items-center space-x-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-700"></span>
                      <span>Garis Ungu: Saldo Titipan Hasil Bumi &amp; Pinjaman PT</span>
                    </span>
                    {chartIncludeBon && (
                      <span className="flex items-center space-x-1.5">
                        <span className="w-2.5 h-1 bg-amber-600 rounded"></span>
                        <span>Garis Putus Oranye: Kewajiban Bon Mitra</span>
                      </span>
                    )}
                  </div>
                  <span className="text-zinc-400 italic">
                    Arahkan kursor pada titik grafik untuk detail per mutasi
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* TAB PEMISAH: SALDO SEDANG BERJALAN (DEFAULT REKENING KORAN) VS HISTORY TRANSAKSI SELESAI (LUNAS / CAIR) */}
          <div className="bg-white rounded-xl border border-zinc-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-100 p-1 text-xs gap-1">
              <button
                type="button"
                onClick={() => setLedgerTab('SALDO_BERJALAN')}
                className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  ledgerTab === 'SALDO_BERJALAN'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <span>Rekening Koran Aktif (Saldo Sedang Berjalan)</span>
                <span
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                    ledgerTab === 'SALDO_BERJALAN'
                      ? 'bg-amber-400 text-slate-950 font-extrabold'
                      : 'bg-zinc-200 text-zinc-700'
                  }`}
                >
                  {historyBerjalanList.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setLedgerTab('HISTORY_SELESAI')}
                className={`px-3.5 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  ledgerTab === 'HISTORY_SELESAI'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <span>History Transaksi Selesai (Lunas &amp; Cair)</span>
                <span
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                    ledgerTab === 'HISTORY_SELESAI'
                      ? 'bg-emerald-200 text-emerald-950 font-extrabold'
                      : 'bg-zinc-200 text-zinc-700'
                  }`}
                >
                  {historySelesaiList.length}
                </span>
              </button>
            </div>

            <div className="text-[11px] text-zinc-500">
              {ledgerTab === 'SALDO_BERJALAN' ? (
                <span>
                  Menampilkan <strong>hanya saldo piutang &amp; titipan/upah yang sedang berjalan</strong>. Transaksi yang sudah lunas/cair tersimpan rapi di tab History.
                </span>
              ) : (
                <span>
                  Arsip riwayat transaksi yang sudah <strong>lunas dibayar</strong> atau <strong>sudah dicairkan</strong> (tidak ikut ditagihkan di Rekening Koran aktif).
                </span>
              )}
            </div>
          </div>

          {/* VIEW MODE 1: MODERN CORPORATE INVOICE TABLE VIEW */}
          {viewMode === 'TABEL' && (
            <div className="bg-white rounded-xl border border-zinc-300 shadow-2xs overflow-hidden">
              {/* Corporate Mini-Header Banner */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <img
                    src={DEFAULT_PT_LOGO_URL}
                    alt="Logo PT Wijaya Agro Perkasa"
                    className="w-12 h-12 rounded-lg object-cover border border-amber-400/50 bg-white p-0.5 shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm sm:text-base font-black tracking-wide uppercase text-white">
                        {activeProfil.namaPerusahaan}
                      </h2>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-400 text-slate-950 uppercase">
                        {ledgerTab === 'SALDO_BERJALAN' ? 'REKENING KORAN BERJALAN' : 'ARSIP HISTORY LUNAS / CAIR'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Kepada YTH: <strong className="text-white">{statement.namaMitra}</strong> ({statement.kodeMitra}) ·{' '}
                      {statement.alamat && statement.alamat !== '-' ? `${statement.alamat} · ` : ''}
                      Telp: {statement.telepon || '-'}
                    </p>
                  </div>
                </div>

                <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-right shrink-0">
                  {(() => {
                    const sisaBayar = statement.sisaBonBersih ?? Math.max(0, statement.totalBonKeseluruhan - statement.totalTitip);
                    const sisaTitip = statement.sisaTitipanBersih ?? Math.max(0, statement.totalTitip - statement.totalBonKeseluruhan);
                    const adaSaldoSilang = statement.totalBonKeseluruhan > 0 && statement.totalTitip > 0;
                    if (sisaBayar > 0) {
                      return (
                        <>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                            Yang Harus Dibayar (Piutang Mitra)
                          </div>
                          <div className="text-base sm:text-lg font-black font-mono tabular-nums text-white">
                            Piutang {formatRupiah(sisaBayar)}
                          </div>
                          {adaSaldoSilang && (
                            <div className="text-[10px] font-mono tabular-nums text-slate-300">
                              Piutang {formatRupiahSingkat(statement.totalBonKeseluruhan)} − Titip {formatRupiahSingkat(statement.totalTitip)} · Belum Kliring
                            </div>
                          )}
                        </>
                      );
                    }
                    if (sisaTitip > 0) {
                      return (
                        <>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                            Yang Harus Dibayar (Hutang PT ke Mitra)
                          </div>
                          <div className="text-base sm:text-lg font-black font-mono tabular-nums text-emerald-300">
                            Hutang {formatRupiah(sisaTitip)}
                          </div>
                          {adaSaldoSilang && (
                            <div className="text-[10px] font-mono tabular-nums text-slate-300">
                              Titip {formatRupiahSingkat(statement.totalTitip)} − Piutang {formatRupiahSingkat(statement.totalBonKeseluruhan)} · Belum Kliring
                            </div>
                          )}
                        </>
                      );
                    }
                    return (
                      <>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                          Yang Harus Dibayar
                        </div>
                        <div className="text-base font-black font-mono tabular-nums text-emerald-300">
                          {adaSaldoSilang ? 'Impas Rp 0 (Belum Kliring)' : 'LUNAS / IMPAS (Rp 0)'}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-zinc-100 border-b-2 border-zinc-300 text-zinc-800 font-extrabold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">NO.</th>
                      <th className="py-3 px-3 w-24">TANGGAL</th>
                      <th className="py-3 px-3 min-w-[230px]">ITEM / URAIAN BARANG</th>
                      <th className="py-3 px-3 text-center w-20">QTY</th>
                      <th className="py-3 px-3 text-right w-28">HARGA</th>
                      <th className="py-3 px-3 text-right w-32 bg-rose-50/60 text-rose-900">
                        {ledgerTab === 'SALDO_BERJALAN' ? 'PIUTANG' : 'BON / KELUAR'}
                      </th>
                      <th className="py-3 px-3 text-right w-32 bg-emerald-50/60 text-emerald-900">
                        {ledgerTab === 'SALDO_BERJALAN' ? 'TITIP / HAK' : 'BAYAR / CAIR'}
                      </th>
                      <th className="py-3 px-3 min-w-[190px]">KETERANGAN</th>
                      <th className="py-3 px-3 text-center w-28">AKSI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 text-zinc-800">
                    {displayedRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-zinc-500">
                          {ledgerTab === 'SALDO_BERJALAN'
                            ? 'Tidak ada saldo piutang atau titipan yang sedang berjalan (Semua transaksi sudah Lunas / Cair).'
                            : 'Belum ada riwayat transaksi selesai (lunas / cair) untuk mitra ini.'}
                        </td>
                      </tr>
                    ) : (
                      displayedRows.map((row, rowIdx) => {
                        const items = row.itemsDetail || [];
                        const isMultiItem = items.length > 1;
                        const singleItem = items.length === 1 ? items[0] : null;
                        const parentTxId = row.idTransaksiInduk || row.id;
                        const sisaNotaIndukVal =
                          row.sisaPiutangNotaInduk ?? row.sisaPiutangNota ?? row.debet;

                        const nominalPiutangCol =
                          ledgerTab === 'SALDO_BERJALAN'
                            ? row.piutangBerjalan ?? row.sisaPiutangNota ?? row.debet
                            : row.debet;
                        const nominalTitipCol =
                          ledgerTab === 'SALDO_BERJALAN'
                            ? row.titipBerjalan ?? (row.kredit === 0 ? row.nominalMutasiHak || 0 : 0)
                            : row.kredit > 0
                            ? row.kredit
                            : row.nominalMutasiHak || 0;

                        const ketUtama = (row.catatanTransaksi || '').trim();

                        return (
                          <tr key={row.id} className="hover:bg-amber-50/30 transition-colors align-top">
                            <td className="py-3 px-3 text-center font-mono tabular-nums font-bold text-zinc-500 text-[11px]">
                              {rowIdx + 1}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap font-mono tabular-nums text-[11px] text-zinc-700">
                              <div className="font-bold text-zinc-900">{row.tanggal}</div>
                              <div className="text-[10px] text-zinc-400">{parentTxId}</div>
                            </td>

                            {/* ITEM / NAMA BARANG */}
                            <td className="py-3 px-3">
                              <div className="space-y-1">
                                {(row.isNotaLalu || row.isNotaNgunci || row.fotoNota || !row.isNotaSilang) && (
                                  <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-zinc-500">
                                    {!row.isNotaSilang && (
                                      <span className="font-bold uppercase tracking-wide text-zinc-600">
                                        {row.jenis.replace(/_/g, ' ')}
                                      </span>
                                    )}
                                    {row.isNotaLalu && (
                                      <span className="font-bold text-amber-800">
                                        Nota Lalu{row.noNotaLalu ? `: ${row.noNotaLalu}` : ''}
                                      </span>
                                    )}
                                    {row.isNotaNgunci && (
                                      <span className="font-bold text-rose-700">
                                        · Nota Kunci
                                      </span>
                                    )}
                                    {row.fotoNota && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPreviewPhoto({
                                            imageUrl: row.fotoNota!,
                                            title: `Bukti Fisik Nota - ${parentTxId}`,
                                            nomorBukti: parentTxId,
                                            namaMitra: statement?.namaMitra,
                                            tanggal: row.tanggal,
                                            nominalText:
                                              nominalPiutangCol > 0
                                                ? formatRupiah(nominalPiutangCol)
                                                : formatRupiah(nominalTitipCol),
                                            keterangan: ketUtama || row.keterangan,
                                          })
                                        }
                                        className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-semibold text-[10px] inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        <Camera className="w-3 h-3 text-amber-700" />
                                        <span>Foto Nota</span>
                                      </button>
                                    )}
                                  </div>
                                )}

                                {isMultiItem ? (
                                  <div className="border border-zinc-200 rounded-lg overflow-hidden bg-zinc-50/70">
                                    <table className="w-full text-[11px] border-collapse">
                                      <thead className="bg-zinc-100 border-b border-zinc-200 text-[9px] font-bold uppercase text-zinc-600">
                                        <tr>
                                          <th className="py-1 px-2 text-left">Nama Barang</th>
                                          <th className="py-1 px-2 text-center">Qty</th>
                                          <th className="py-1 px-2 text-right">Harga</th>
                                          <th className="py-1 px-2 text-right">Jumlah</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-zinc-200/70 bg-white">
                                        {items.map((it, idx) => (
                                          <tr key={idx}>
                                            <td className="py-1 px-2 font-semibold text-zinc-900">
                                              {idx + 1}. {it.nama}
                                            </td>
                                            <td className="py-1 px-2 text-center font-mono tabular-nums text-zinc-700 whitespace-nowrap">
                                              {it.qty} {it.satuan}
                                            </td>
                                            <td className="py-1 px-2 text-right font-mono tabular-nums text-zinc-600 whitespace-nowrap">
                                              {formatRupiah(it.harga)}
                                            </td>
                                            <td className="py-1 px-2 text-right font-mono tabular-nums font-bold text-zinc-900 whitespace-nowrap">
                                              {formatRupiah(it.subtotal)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : singleItem ? (
                                  <div className="font-bold text-zinc-900 text-xs">
                                    {singleItem.nama}
                                  </div>
                                ) : (
                                  <div className="font-medium text-zinc-900 text-xs">
                                    {row.keterangan || '-'}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* QTY */}
                            <td className="py-3 px-3 text-center font-mono tabular-nums font-bold text-zinc-800 whitespace-nowrap text-[11px]">
                              {isMultiItem
                                ? `${items.length} Brg`
                                : singleItem
                                ? `${singleItem.qty} ${singleItem.satuan}`
                                : row.qtyDisplay || '-'}
                            </td>

                            {/* HARGA */}
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-zinc-700 whitespace-nowrap text-[11px]">
                              {isMultiItem
                                ? 'Terlampir'
                                : singleItem
                                ? formatRupiah(singleItem.harga)
                                : row.hargaSatuanDisplay || '-'}
                            </td>

                            {/* PIUTANG */}
                            <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-rose-800 bg-rose-50/20 whitespace-nowrap text-xs">
                              {nominalPiutangCol > 0 ? formatRupiah(nominalPiutangCol) : '-'}
                              {ledgerTab === 'SALDO_BERJALAN' &&
                                row.debet > 0 &&
                                nominalPiutangCol > 0 &&
                                nominalPiutangCol < row.debet && (
                                  <div className="text-[9px] font-normal text-zinc-500">
                                    Awal: {formatRupiah(row.debet)}
                                  </div>
                                )}
                            </td>

                            {/* TITIP / HAK */}
                            <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-emerald-800 bg-emerald-50/20 whitespace-nowrap text-xs">
                              {nominalTitipCol > 0 ? formatRupiah(nominalTitipCol) : '-'}
                              {ledgerTab === 'SALDO_BERJALAN' &&
                                (row.nominalMutasiHak || 0) > 0 &&
                                nominalTitipCol > 0 &&
                                nominalTitipCol < (row.nominalMutasiHak || 0) && (
                                  <div className="text-[9px] font-normal text-zinc-500">
                                    Awal: {formatRupiah(row.nominalMutasiHak || 0)}
                                  </div>
                                )}
                            </td>

                            {/* KETERANGAN TRANSAKSI (JELAS UNTUK MITRA) */}
                            <td className="py-3 px-3 text-[11px] text-zinc-800">
                              {ketUtama ? (
                                <div className="font-semibold text-zinc-900 leading-snug">
                                  {ketUtama}
                                </div>
                              ) : row.catatanNgunci ? (
                                <div className="text-rose-800 font-medium leading-snug">
                                  Kronologi: {row.catatanNgunci}
                                </div>
                              ) : (
                                <span className="text-zinc-400">-</span>
                              )}
                            </td>

                            {/* AKSI */}
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                                {row.debet > 0 && (row.sisaPiutangNota ?? 0) > 0 && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={partnerActionBusy}
                                      onClick={() =>
                                        openQuickPayModal({
                                          idNotaTarget: parentTxId,
                                          noNotaLabel: row.noNotaLalu || parentTxId,
                                          sisaNotaTarget: sisaNotaIndukVal || row.debet,
                                          isTargetNgunci: Boolean(row.isNotaNgunci),
                                        })
                                      }
                                      className="inline-flex items-center space-x-1 px-2 py-1 text-[10px] font-bold rounded border text-emerald-800 bg-emerald-50 hover:bg-emerald-700 hover:text-white border-emerald-300 transition-colors cursor-pointer"
                                      title="Terima pembayaran piutang nota ini"
                                    >
                                      <HandCoins className="w-3 h-3" />
                                      <span>Bayar</span>
                                    </button>

                                    <button
                                      type="button"
                                      disabled={partnerActionBusy}
                                      onClick={() =>
                                        openModalUbahStatusNota({
                                          idNota: parentTxId,
                                          noNota: row.noNotaLalu || parentTxId,
                                          nominal: sisaNotaIndukVal || row.debet,
                                          targetNgunci: !row.isNotaNgunci,
                                          currentCatatan: row.catatanNgunci,
                                        })
                                      }
                                      className={`inline-flex items-center space-x-1 px-2 py-1 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
                                        row.isNotaNgunci
                                          ? 'text-emerald-800 bg-white hover:bg-emerald-50 border-emerald-300'
                                          : 'text-rose-800 bg-rose-50 hover:bg-rose-100 border-rose-200'
                                      }`}
                                    >
                                      {row.isNotaNgunci ? (
                                        <>
                                          <Unlock className="w-3 h-3" />
                                          <span>Aktifkan</span>
                                        </>
                                      ) : (
                                        <>
                                          <Lock className="w-3 h-3" />
                                          <span>Kunci</span>
                                        </>
                                      )}
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setUniversalEditId(parentTxId)}
                                  className="inline-flex items-center space-x-1 px-2 py-1 text-[10px] font-bold text-zinc-800 hover:text-white bg-zinc-100 hover:bg-zinc-900 rounded border border-zinc-300 hover:border-zinc-900 transition-colors cursor-pointer"
                                  title="Edit detail nominal, qty, harga, keterangan, atau tanggal"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={partnerActionBusy || deletingTx}
                                  onClick={() => {
                                    setDeleteTxError('');
                                    setDeleteTxTarget({
                                      idTransaksi: parentTxId,
                                      tanggal: row.tanggal,
                                      uraian:
                                        singleItem?.nama ||
                                        (isMultiItem ? `${items.length} Barang (${items.map((x) => x.nama).join(', ')})` : '') ||
                                        row.keterangan ||
                                        row.jenis.replace(/_/g, ' '),
                                      nominal:
                                        nominalPiutangCol ||
                                        nominalTitipCol ||
                                        row.debet ||
                                        row.kredit ||
                                        row.nominalMutasiHak ||
                                        0,
                                      keterangan: ketUtama || undefined,
                                    });
                                  }}
                                  className="inline-flex items-center space-x-1 px-2 py-1 text-[10px] font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-700 rounded border border-rose-200 hover:border-rose-700 transition-colors cursor-pointer"
                                  title="Hapus transaksi ini (misal salah input / double input)"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Hapus</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {ledgerTab === 'SALDO_BERJALAN' && (
                    <tfoot className="bg-zinc-100 font-bold border-t-2 border-zinc-300 text-xs">
                      <tr>
                        <td colSpan={5} className="py-3 px-4 text-right uppercase text-[11px] text-zinc-700">
                          Total Saldo Berjalan (Piutang vs Titip/Hak Mitra):
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-rose-800 bg-rose-50/50">
                          {formatRupiah(statement.totalBonKeseluruhan)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-800 bg-emerald-50/50">
                          {formatRupiah(statement.totalTitip)}
                        </td>
                        <td colSpan={2} className="py-3 px-4 text-left font-mono tabular-nums text-slate-900">
                          {(statement.sisaBonBersih ?? Math.max(0, statement.totalBonKeseluruhan - statement.totalTitip)) > 0
                            ? `Yang Harus Dibayar: Piutang ${formatRupiah(statement.sisaBonBersih ?? Math.max(0, statement.totalBonKeseluruhan - statement.totalTitip))}`
                            : (statement.sisaTitipanBersih ?? Math.max(0, statement.totalTitip - statement.totalBonKeseluruhan)) > 0
                            ? `Yang Harus Dibayar: Hutang ${formatRupiah(statement.sisaTitipanBersih ?? Math.max(0, statement.totalTitip - statement.totalBonKeseluruhan))}`
                            : 'IMPAS (Rp 0)'}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Footer Rekening Bank Perusahaan Khas Nota Lama */}
              <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">
                    TF REKENING RESMI PERUSAHAAN VIA:
                  </div>
                  <div className="font-mono font-bold text-zinc-800 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <span>BNI : 035 285 1268</span>
                    <span>BRI : 8052 0103 2353 539</span>
                    <span>MANDIRI : 112000 1596 3635</span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-700">
                    A/N : FAHLEVI MARTA WIJAYA
                  </div>
                </div>
                <div className="sm:text-right text-[11px] text-zinc-600">
                  <div className="font-black text-zinc-900 uppercase">TERIMA KASIH</div>
                  <div>{activeProfil.namaPerusahaan} — KASIR / ADM</div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: MODERN CORPORATE INVOICE A4 PRINT SHEET (MIRIP NOTA PERUSAHAAN) */}
          {viewMode === 'LEMBAR_CETAK' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-900 text-white rounded-xl px-4 py-3 text-xs">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Mode Nota / Rekening Koran Resmi Perusahaan:</strong> Menampilkan tata letak khas nota PT Wijaya Agro Perkasa (Kolom ITEM, QTY, HARGA, PIUTANG, TITIP, KETERANGAN).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handlePrintClick}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-3.5 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-2xs shrink-0 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak / Download PDF</span>
                </button>
              </div>

              <div className="bg-white rounded-xl shadow-md border-2 border-zinc-800 p-6 sm:p-8 space-y-5 max-w-5xl mx-auto text-zinc-900 print:shadow-none print:border-none print:p-0">
                {/* 1. KOP NOTA MODERN KHAS PT WIJAYA AGRO PERKASA */}
                <div className="border-b-2 border-zinc-900 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <img
                      src={DEFAULT_PT_LOGO_URL}
                      alt="Logo PT Wijaya Agro Perkasa"
                      className="w-16 h-16 rounded-lg object-cover border border-zinc-300 shrink-0"
                    />
                    <div className="space-y-0.5">
                      <h3 className="text-xl font-black text-zinc-900 tracking-tight uppercase">
                        {activeProfil.namaPerusahaan}
                      </h3>
                      <p className="text-[11px] font-semibold text-zinc-700">
                        {activeProfil.alamat}
                      </p>
                      <p className="text-[10px] font-mono font-bold text-zinc-700">
                        TELPON KASIR 0821 44 999 305 · TELPON ADM 0812 2000 3305
                      </p>
                      <p className="text-[10px] text-zinc-600">
                        EMAIL : {activeProfil.email}
                      </p>
                    </div>
                  </div>

                  <div className="sm:text-right border border-zinc-800 rounded-lg p-2.5 bg-zinc-50 min-w-[230px]">
                    <div className="text-xs font-black uppercase tracking-wider text-zinc-900 border-b border-zinc-300 pb-1 mb-1">
                      INVOICE / REKENING KORAN
                    </div>
                    <div className="text-[10px] space-y-0.5 font-mono">
                      <div className="flex justify-between gap-3">
                        <span className="text-zinc-500 font-sans">Tanggal:</span>
                        <strong className="text-zinc-900">{tglCetak}</strong>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-zinc-500 font-sans">Kategori:</span>
                        <strong className="text-zinc-900">
                          {getRoleMitraLabel(statement.role, {
                            isAnakPerusahaan: statement.isAnakPerusahaan,
                            isKaryawan: statement.isKaryawan,
                          })}
                        </strong>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-zinc-500 font-sans">Jenis Buku:</span>
                        <strong className="text-amber-900">
                          {ledgerTab === 'SALDO_BERJALAN' ? 'SALDO BERJALAN' : 'HISTORY SELESAI'}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. SUB-HEADER KEPADA YTH & KOTAK JUMLAH YANG HARUS DIBAYAR */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-stretch">
                  <div className="sm:col-span-7 border border-zinc-400 rounded-lg p-3.5 text-xs space-y-1 bg-white">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">
                      KEPADA YTH :
                    </div>
                    <div className="grid grid-cols-[75px_1fr] gap-y-0.5 text-[11px]">
                      <span className="font-semibold text-zinc-600">NAMA</span>
                      <span className="font-black text-zinc-900 uppercase">
                        : {statement.namaMitra} ({statement.kodeMitra})
                      </span>
                      <span className="font-semibold text-zinc-600">ALAMAT</span>
                      <span className="font-medium text-zinc-800">: {statement.alamat || '-'}</span>
                      <span className="font-semibold text-zinc-600">PHONE</span>
                      <span className="font-mono font-semibold text-zinc-800">: {statement.telepon || '-'}</span>
                      <span className="font-semibold text-zinc-600">STATUS</span>
                      <span className="font-bold text-amber-900">
                        : {statement.totalBonKeseluruhan > statement.totalTitip
                          ? 'PIUTANG MITRA BERJALAN'
                          : statement.totalTitip > statement.totalBonKeseluruhan
                          ? 'HUTANG PT KE MITRA (TITIPAN)'
                          : 'SALDO IMPAS / LUNAS'}
                      </span>
                    </div>
                  </div>

                  <div className="sm:col-span-5 border-2 border-zinc-900 rounded-lg p-3.5 bg-amber-50/70 flex flex-col justify-between">
                    {(() => {
                      const sisaBayar = statement.sisaBonBersih ?? Math.max(0, statement.totalBonKeseluruhan - statement.totalTitip);
                      const sisaTitip = statement.sisaTitipanBersih ?? Math.max(0, statement.totalTitip - statement.totalBonKeseluruhan);
                      if (sisaBayar > 0) {
                        return (
                          <>
                            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-800">
                              YANG HARUS DI BAYAR (PIUTANG) :
                            </div>
                            <div className="text-xl font-black font-mono tabular-nums text-rose-900 my-1">
                              PIUTANG {formatRupiah(sisaBayar)}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-600 border-t border-amber-300 pt-1 flex justify-between">
                              <span>Piutang: {formatRupiah(statement.totalBonKeseluruhan)}</span>
                              <span>Titip: {formatRupiah(statement.totalTitip)}</span>
                            </div>
                          </>
                        );
                      }
                      if (sisaTitip > 0) {
                        return (
                          <>
                            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-900">
                              YANG HARUS DI BAYAR (HUTANG PT) :
                            </div>
                            <div className="text-xl font-black font-mono tabular-nums text-emerald-900 my-1">
                              HUTANG {formatRupiah(sisaTitip)}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-600 border-t border-amber-300 pt-1 flex justify-between">
                              <span>Titip: {formatRupiah(statement.totalTitip)}</span>
                              <span>Piutang: {formatRupiah(statement.totalBonKeseluruhan)}</span>
                            </div>
                          </>
                        );
                      }
                      return (
                        <>
                          <div className="text-[10px] font-black uppercase tracking-wider text-zinc-800">
                            JUMLAH YANG HARUS DI BAYAR :
                          </div>
                          <div className="text-xl font-black font-mono tabular-nums text-emerald-800 my-1">
                            Rp 0 (IMPAS)
                          </div>
                          <div className="text-[10px] text-zinc-600">Tidak ada selisih berjalan</div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* 3. TABEL REKENING KORAN (NO | TANGGAL | ITEM | QTY | HARGA | PIUTANG | TITIP | KETERANGAN) */}
                <div className="border-2 border-zinc-900 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-zinc-900 text-white font-bold uppercase text-[9px]">
                      <tr>
                        <th className="py-2 px-2 w-8 text-center">NO.</th>
                        <th className="py-2 px-2 w-20">TANGGAL</th>
                        <th className="py-2 px-2.5">ITEM</th>
                        <th className="py-2 px-2 text-center w-16">QTY</th>
                        <th className="py-2 px-2 text-right w-24">HARGA</th>
                        <th className="py-2 px-2 text-right w-26">PIUTANG</th>
                        <th className="py-2 px-2 text-right w-26">TITIP</th>
                        <th className="py-2 px-2.5 w-44">KETERANGAN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-300 text-zinc-900 text-[10px]">
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-zinc-400">
                            Tidak ada transaksi saldo berjalan pada rekening koran ini
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((row, rIdx) => {
                          const items = row.itemsDetail || [];
                          const isMulti = items.length > 1;
                          const single = items.length === 1 ? items[0] : null;
                          const piutangVal =
                            ledgerTab === 'SALDO_BERJALAN'
                              ? row.piutangBerjalan ?? row.sisaPiutangNota ?? row.debet
                              : row.debet;
                          const titipVal =
                            ledgerTab === 'SALDO_BERJALAN'
                              ? row.titipBerjalan ?? (row.kredit === 0 ? row.nominalMutasiHak || 0 : 0)
                              : row.kredit > 0
                              ? row.kredit
                              : row.nominalMutasiHak || 0;
                          const ketNote = (row.catatanTransaksi || row.catatanNgunci || '').trim();

                          return (
                            <tr key={row.id} className="align-top">
                              <td className="py-2 px-2 text-center font-mono tabular-nums font-bold">{rIdx + 1}</td>
                              <td className="py-2 px-2 font-mono tabular-nums whitespace-nowrap">{row.tanggal}</td>
                              <td className="py-2 px-2.5">
                                {isMulti ? (
                                  <div className="space-y-0.5">
                                    <div className="font-bold text-[9px] uppercase text-indigo-950">
                                      {row.jenis.replace(/_/g, ' ')}
                                    </div>
                                    {items.map((it, idx) => (
                                      <div key={idx} className="flex justify-between gap-2 text-[10px] border-b border-dotted border-zinc-200 last:border-none py-0.5">
                                        <span className="font-semibold">
                                          {idx + 1}. {it.nama}
                                        </span>
                                        <span className="font-mono tabular-nums text-zinc-700 whitespace-nowrap">
                                          {it.qty} {it.satuan} × {formatRupiah(it.harga)} = <strong>{formatRupiah(it.subtotal)}</strong>
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : single ? (
                                  <div className="font-bold text-zinc-900">{single.nama}</div>
                                ) : (
                                  <div className="font-semibold">{row.keterangan || row.jenis.replace(/_/g, ' ')}</div>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center font-mono tabular-nums font-bold whitespace-nowrap">
                                {isMulti ? `${items.length} Item` : single ? `${single.qty} ${single.satuan}` : row.qtyDisplay || '-'}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                                {isMulti ? 'Rincian' : single ? formatRupiah(single.harga) : row.hargaSatuanDisplay || '-'}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums font-bold text-rose-800 whitespace-nowrap">
                                {piutangVal > 0 ? formatRupiah(piutangVal) : '-'}
                              </td>
                              <td className="py-2 px-2 text-right font-mono tabular-nums font-bold text-emerald-800 whitespace-nowrap">
                                {titipVal > 0 ? formatRupiah(titipVal) : '-'}
                              </td>
                              <td className="py-2 px-2.5 text-zinc-900 font-semibold">
                                {ketNote || '-'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot className="bg-zinc-100 font-bold border-t-2 border-zinc-900 text-[10px]">
                      <tr>
                        <td colSpan={5} className="py-2.5 px-3 text-right uppercase">
                          TOTAL SALDO BERJALAN :
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-rose-900">
                          {formatRupiah(statement.totalBonKeseluruhan)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-900">
                          {formatRupiah(statement.totalTitip)}
                        </td>
                        <td className="py-2.5 px-2.5 font-mono text-zinc-900">
                          {(statement.sisaBonBersih ?? Math.max(0, statement.totalBonKeseluruhan - statement.totalTitip)) > 0
                            ? `Piutang: ${formatRupiah(statement.sisaBonBersih ?? Math.max(0, statement.totalBonKeseluruhan - statement.totalTitip))}`
                            : (statement.sisaTitipanBersih ?? Math.max(0, statement.totalTitip - statement.totalBonKeseluruhan)) > 0
                            ? `Hutang: ${formatRupiah(statement.sisaTitipanBersih ?? Math.max(0, statement.totalTitip - statement.totalBonKeseluruhan))}`
                            : 'IMPAS (Rp 0)'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* 4. FOOTER KHAS NOTA LAMA: TF REKENING VIA, STEMPEL PT, & TANDA TANGAN */}
                <div className="pt-3 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center text-xs">
                  <div className="sm:col-span-5 border border-zinc-400 rounded-lg p-3 bg-zinc-50 space-y-0.5">
                    <div className="text-[10px] font-black uppercase text-zinc-800">
                      TF REKENING VIA :
                    </div>
                    <div className="font-mono font-bold text-[11px] text-zinc-900 space-y-0.5">
                      <div>BNI : 035 285 1268</div>
                      <div>BRI : 8052 0103 2353 539</div>
                      <div>MANDIRI : 112000 1596 3635</div>
                    </div>
                    <div className="text-[10px] font-extrabold text-zinc-800 pt-0.5">
                      AN FAHLEVI MARTA WIJAYA
                    </div>
                  </div>

                  <div className="sm:col-span-3 hidden sm:block" />

                  <div className="sm:col-span-4 text-center sm:text-right space-y-6">
                    <div>
                      <div className="text-xs font-black uppercase text-zinc-900">TERIMA KASIH</div>
                      <div className="text-[10px] font-bold text-zinc-600">{activeProfil.namaPerusahaan}</div>
                    </div>
                    <div className="pt-2">
                      <div className="w-40 border-b border-zinc-800 sm:ml-auto mx-auto" />
                      <div className="text-[10px] font-bold text-zinc-900 mt-1 uppercase">
                        ( KASIR / {activeProfil.penanggungJawab} )
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lampiran Bukti Fisik Nota Lalu */}
                {displayedRows.some((h) => !!h.fotoNota) && (
                  <div className="pt-6 border-t-2 border-dashed border-zinc-300 space-y-4 print-page-break print:break-before-page">
                    <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                      <div className="flex items-center space-x-2">
                        <Camera className="w-4 h-4 text-amber-600" />
                        <h4 className="text-xs font-bold text-zinc-900 uppercase">
                          Lampiran Fisik Bukti Nota Terkait
                        </h4>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Dokumen Asli Tersimpan di Database
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {displayedRows
                        .filter((h) => !!h.fotoNota)
                        .flatMap((h) => {
                          const imgs = (h.fotoNota || '').split('|||').map((s) => s.trim()).filter(Boolean);
                          return imgs.map((img, idx) => ({
                            txId: h.id,
                            noNotaLalu: h.noNotaLalu,
                            tanggal: h.tanggal,
                            jenis: h.jenis,
                            keterangan: h.catatanTransaksi || h.keterangan,
                            nominal: h.piutangBerjalan || h.debet || h.titipBerjalan || h.nominalMutasiHak || 0,
                            img,
                            idx: idx + 1,
                            total: imgs.length,
                          }));
                        })
                        .map((att, i) => (
                          <div
                            key={i}
                            className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2 text-left print-avoid-break print:break-inside-avoid print:bg-white print:border-zinc-300"
                          >
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-mono font-bold text-zinc-800 bg-white px-1.5 py-0.5 rounded border border-zinc-200">
                                {att.noNotaLalu ? `No. Nota: ${att.noNotaLalu}` : att.txId}
                                {att.total > 1 ? ` (${att.idx}/${att.total})` : ''}
                              </span>
                              <span className="text-zinc-500">{att.tanggal}</span>
                            </div>
                            <div className="text-[10px] font-semibold text-zinc-800 flex justify-between">
                              <span>{att.jenis.replace(/_/g, ' ')}</span>
                              <span className="text-amber-900 font-mono font-bold">{formatRupiah(att.nominal)}</span>
                            </div>
                            {att.keterangan && (
                              <div className="text-[9px] text-zinc-600 italic line-clamp-2">
                                {att.keterangan}
                              </div>
                            )}
                            <div className="rounded border border-zinc-200 bg-white overflow-hidden p-1 flex justify-center">
                              <img
                                src={att.img}
                                alt={`Bukti Nota ${att.txId}`}
                                className="max-h-48 w-auto object-contain rounded"
                              />
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Official Rekening Koran Print Modal */}
      {showPrintModal && (
        <CetakRekeningKoranModal
          statement={statement}
          profilPerusahaan={activeProfil}
          rekeningUtamaDetail={activeRekeningUtama}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {/* Foto Nota Preview Modal */}
      {previewPhoto && (
        <FotoNotaPreviewModal
          isOpen={Boolean(previewPhoto)}
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

      {/* Modal Edit / Nego Transaksi Rekening Koran */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-indigo-700 text-white font-bold text-sm flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Pencil className="w-4 h-4 text-indigo-200" />
                <span>Penyesuaian / Nego Transaksi</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="text-indigo-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 sm:p-6 space-y-4 text-xs">
              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg space-y-1">
                <div className="text-[11px] font-semibold text-indigo-900 flex justify-between">
                  <span>Nomor Bukti:</span>
                  <span className="font-mono font-bold">{editingEntry.id}</span>
                </div>
                <div className="text-[11px] text-zinc-600 flex justify-between">
                  <span>Jenis Transaksi:</span>
                  <span className="font-semibold text-zinc-800">{editingEntry.jenis.replace(/_/g, ' ')}</span>
                </div>
                <div className="text-[11px] text-zinc-600 flex justify-between">
                  <span>Nilai Sebelumnya:</span>
                  <span className="font-mono font-bold text-zinc-900">{formatRupiah(editingEntry.currentNominal)}</span>
                </div>
              </div>

              {editSuccessMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] font-medium flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{editSuccessMsg}</span>
                </div>
              )}

              {editErrorMsg && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[11px] font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span>{editErrorMsg}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Nominal Baru (Hasil Nego / Penyesuaian) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-bold text-zinc-400">Rp</span>
                  <input
                    type="number"
                    required
                    min={1}
                    value={editNominalInput}
                    onChange={(e) => setEditNominalInput(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono font-bold text-sm text-zinc-900"
                  />
                </div>
                {Number(editNominalInput) > 0 && (
                  <div className="text-[11px] text-indigo-700 font-medium mt-1">
                    Terbilang: {formatRupiah(Number(editNominalInput))}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Tanggal Transaksi</label>
                <input
                  type="text"
                  value={editTanggalInput}
                  onChange={(e) => setEditTanggalInput(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-zinc-800 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Keterangan / Alasan Nego</label>
                <input
                  type="text"
                  value={editKeteranganInput}
                  onChange={(e) => setEditKeteranganInput(e.target.value)}
                  placeholder="Cth: Kesepakatan harga nego panen atau diskon potongan"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-zinc-800"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || Number(editNominalInput) <= 0}
                  className="px-5 py-2 bg-indigo-700 text-white font-semibold rounded-lg hover:bg-indigo-800 disabled:opacity-50 transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingEdit ? 'Menyimpan...' : 'Simpan Nego & Sinkronkan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Pinjam Uang dari PT ke Mitra (Masuk Saldo Titip) */}
      <ModalPinjamUangMitra
        isOpen={modalPinjamUangOpen}
        onClose={() => setModalPinjamUangOpen(false)}
        mitraList={mitraList}
        preselectedMitraId={currentMitraId}
        onSuccess={(result) => {
          if (currentMitraId) loadStatementData(currentMitraId);
          onRefreshParent?.();
        }}
      />

      {/* Modal Bersihkan Bukti Nota Lalu (Hapus Berdasarkan Nama atau Waktu & Update Rekening Mitra) */}
      <ModalBersihkanNotaLalu
        isOpen={modalBersihkanNotaOpen}
        onClose={() => setModalBersihkanNotaOpen(false)}
        mitraList={mitraList}
        preselectedMitraId={currentMitraId}
        onSuccess={() => {
          if (currentMitraId) loadStatementData(currentMitraId);
          onRefreshParent?.();
        }}
      />

      {/* Modal Bagikan Link Rekening Koran Mitra */}
      {statement && (
        <ShareLinkModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          title={`Bagikan Rekening Koran ${statement.namaMitra}`}
          subtitle="Tautan publik resmi khusus penerima (Hanya Baca / Read-Only)"
          shareType="rekening-koran"
          targetId={statement.idMitra}
          targetName={statement.namaMitra}
          companyName={activeProfil.namaPerusahaan}
        />
      )}

      {/* Modal Transaksi Terpadu Anak Perusahaan & Mitra (1 Transaksi) */}
      <ModalTransaksiAnakPerusahaan
        isOpen={anakPerusahaanModalOpen}
        onClose={() => setAnakPerusahaanModalOpen(false)}
        rekeningList={rekeningList}
        targetRekeningKode={statement?.kodeRekeningTerkait || 'REK-DPPARABO'}
        onSuccess={(receipt) => {
          if (currentMitraId) loadStatementData(currentMitraId);
          onRefreshParent?.();
          if (receipt && onSuccessReceipt) {
            onSuccessReceipt(receipt);
          }
        }}
      />

      {/* Modal Universal Edit Detail Setiap Transaksi Mitra */}
      <ModalEditTransaksiUniversal
        isOpen={Boolean(universalEditId)}
        transactionId={universalEditId}
        onClose={() => setUniversalEditId(null)}
        onSuccess={() => {
          if (currentMitraId) loadStatementData(currentMitraId);
          onRefreshParent?.();
        }}
      />

      {/* Modal Konfirmasi Kosongkan Saldo Mitra */}
      {confirmResetOpen && statement && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-zinc-200 overflow-hidden">
            <div className="p-4 bg-amber-700 text-white font-bold text-sm flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <RotateCcw className="w-4 h-4" />
                <span>Kosongkan Saldo {statement.namaMitra}</span>
              </div>
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                disabled={partnerActionBusy}
                className="text-amber-100 hover:text-white cursor-pointer px-1"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3.5 text-xs text-zinc-700">
              <p className="leading-relaxed">
                Seluruh nominal bon barang, kasbon uang, piutang, dan titipan panen/dana milik{' '}
                <strong className="text-zinc-900">{statement.namaMitra}</strong> (
                <span className="font-mono">{statement.kodeMitra}</span>) akan dikosongkan ke{' '}
                <strong className="font-mono text-zinc-900">Rp 0</strong>. Data profil mitra tetap utuh.
              </p>
              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setConfirmResetOpen(false)}
                  disabled={partnerActionBusy}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleResetCurrentMitra}
                  disabled={partnerActionBusy}
                  className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {partnerActionBusy ? 'Memproses...' : 'Ya, Kosongkan ke Rp 0'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Mitra */}
      {confirmDeleteOpen && statement && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-zinc-200 overflow-hidden">
            <div className="p-4 bg-rose-700 text-white font-bold text-sm flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Trash2 className="w-4 h-4" />
                <span>Hapus Mitra {statement.namaMitra}</span>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={partnerActionBusy}
                className="text-rose-100 hover:text-white cursor-pointer px-1"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3.5 text-xs text-zinc-700">
              <p className="leading-relaxed">
                Yakin ingin menghapus mitra{' '}
                <strong className="text-zinc-900">{statement.namaMitra}</strong> (
                <span className="font-mono">{statement.kodeMitra}</span>) secara permanen dari sistem?
              </p>
              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(false)}
                  disabled={partnerActionBusy}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCurrentMitra}
                  disabled={partnerActionBusy}
                  className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {partnerActionBusy ? 'Menghapus...' : 'Hapus Mitra Permanen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ubah Status Nota Piutang <-> Nota Kunci */}
      <ModalToggleNotaNgunci
        target={toggleNgunciTarget}
        submitting={partnerActionBusy}
        errorMsg={toggleNgunciError}
        onClose={() => setToggleNgunciTarget(null)}
        onConfirm={(catatan) => void handleConfirmToggleNotaNgunci(catatan)}
      />

      {/* Modal Terima Pembayaran Cepat Piutang / Nota Kunci di Rekening Mitra */}
      {quickPayModal?.open && statement && (() => {
        const bonKotor = statement.totalBonKeseluruhan || 0;
        const titipAktif = statement.totalTitip || 0;
        const maksSinkron = Math.min(bonKotor, titipAktif);
        const sisaFisik = bonKotor;
        const canSinkron = bonKotor > 0 && titipAktif > 0 && maksSinkron > 0;
        const targetMaks = quickPayMetode === 'SINKRON' ? maksSinkron : sisaFisik;
        const nomInput = Math.round(Number(quickPayNominalInput) || 0);
        const isOver = targetMaks > 0 && nomInput > targetMaks;

        const nomKunciAwal = statement.nominalNotaNgunci || 0;
        const totalAlokasi = nomInput;
        let estPengurangKunci = 0;
        if (nomInput > 0 && nomKunciAwal > 0) {
          if (quickPayModal.idNotaTarget && quickPayModal.isTargetNgunci === false) {
            const sisaTargetAktif = quickPayModal.sisaNotaTarget || 0;
            const lebihanKeKunci = Math.max(0, totalAlokasi - sisaTargetAktif);
            estPengurangKunci = Math.min(nomKunciAwal, lebihanKeKunci);
          } else {
            estPengurangKunci = Math.min(nomKunciAwal, totalAlokasi);
          }
        }
        const estSisaKunci = Math.max(0, nomKunciAwal - estPengurangKunci);

        return (
          <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-zinc-200 overflow-hidden">
              <div className="p-4 bg-emerald-800 text-white font-bold text-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HandCoins className="w-4 h-4 text-emerald-200" />
                  <span>
                    {nomKunciAwal > 0
                      ? `Terima Pembayaran Nota Kunci — ${statement.namaMitra}`
                      : `Terima Pembayaran Piutang — ${statement.namaMitra}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickPayModal(null)}
                  disabled={quickPayBusy}
                  className="text-emerald-100 hover:text-white cursor-pointer px-1"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmitQuickPay} className="p-5 space-y-4 text-xs text-zinc-700">
                {quickPayError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center gap-2 font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{quickPayError}</span>
                  </div>
                )}

                <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Mitra:</span>
                    <strong className="text-zinc-900">
                      {statement.namaMitra} ({statement.kodeMitra})
                    </strong>
                  </div>
                  {quickPayModal.noNotaLabel && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Target Nota Prioritas:</span>
                      <span className="font-mono font-bold text-zinc-900">
                        {quickPayModal.noNotaLabel}
                        {quickPayModal.sisaNotaTarget
                          ? ` (Sisa: ${formatRupiah(quickPayModal.sisaNotaTarget)})`
                          : ''}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Total Sisa Bon Mitra:</span>
                    <span className="font-mono font-bold text-zinc-900 tabular-nums">
                      {formatRupiah(bonKotor)}
                    </span>
                  </div>
                  {titipAktif > 0 && (
                    <div className="flex justify-between text-purple-900">
                      <span>Saldo Titipan / Uang Hasil Bumi:</span>
                      <span className="font-mono font-bold tabular-nums">
                        {formatRupiah(titipAktif)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Pilih Metode */}
                <div>
                  <label className="block font-semibold text-zinc-800 mb-1.5">
                    Metode Penerimaan Pembayaran <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={sisaFisik <= 0}
                      onClick={() => {
                        setQuickPayMetode('TUNAI');
                        setQuickPayNominalInput(
                          String(
                            quickPayModal.sisaNotaTarget
                              ? Math.min(quickPayModal.sisaNotaTarget, sisaFisik)
                              : sisaFisik
                          )
                        );
                      }}
                      className={`py-2 px-2.5 rounded-lg font-bold border text-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        quickPayMetode === 'TUNAI'
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                      }`}
                    >
                      Tunai (KAS01)
                    </button>
                    <button
                      type="button"
                      disabled={sisaFisik <= 0}
                      onClick={() => {
                        setQuickPayMetode('TRANSFER');
                        setQuickPayNominalInput(
                          String(
                            quickPayModal.sisaNotaTarget
                              ? Math.min(quickPayModal.sisaNotaTarget, sisaFisik)
                              : sisaFisik
                          )
                        );
                      }}
                      className={`py-2 px-2.5 rounded-lg font-bold border text-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        quickPayMetode === 'TRANSFER'
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                      }`}
                    >
                      Transfer Bank
                    </button>
                    <button
                      type="button"
                      disabled={!canSinkron}
                      onClick={() => {
                        setQuickPayMetode('SINKRON');
                        setQuickPayNominalInput(
                          String(
                            quickPayModal.sisaNotaTarget
                              ? Math.min(quickPayModal.sisaNotaTarget, maksSinkron)
                              : maksSinkron
                          )
                        );
                      }}
                      className={`py-2 px-2.5 rounded-lg font-bold border text-center flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        quickPayMetode === 'SINKRON'
                          ? 'bg-cyan-700 text-white border-cyan-700'
                          : 'bg-cyan-50 text-cyan-900 border-cyan-300 hover:bg-cyan-100'
                      }`}
                    >
                      <RefreshCw className="w-3 h-3 shrink-0" />
                      <span>Potong Titipan</span>
                    </button>
                  </div>
                </div>

                {quickPayMetode === 'TRANSFER' && (
                  <div>
                    <label className="block font-semibold text-zinc-800 mb-1">
                      Rekening Bank Tujuan <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={quickPayRekening}
                      onChange={(e) => setQuickPayRekening(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-medium bg-white"
                    >
                      {availableBanks.map((b) => (
                        <option key={b.kode} value={b.kode}>
                          {b.nama} ({b.kode}) — Saldo: {formatRupiah(b.saldoSaatIni)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-zinc-800 mb-1">
                    Nominal Pembayaran (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="any"
                      min={1}
                      max={targetMaks || undefined}
                      required
                      value={quickPayNominalInput}
                      onChange={(e) => setQuickPayNominalInput(e.target.value)}
                      className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg font-mono font-bold text-sm text-zinc-900 focus:ring-1 focus:ring-emerald-600"
                    />
                    {targetMaks > 0 && (
                      <button
                        type="button"
                        onClick={() => setQuickPayNominalInput(String(targetMaks))}
                        className="px-3 py-2 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold cursor-pointer shrink-0"
                      >
                        Lunas ({formatRupiahSingkat(targetMaks)})
                      </button>
                    )}
                  </div>
                  {isOver && (
                    <p className="text-[11px] text-rose-700 font-semibold mt-1">
                      Nominal melebihi batas maksimal ({formatRupiah(targetMaks)}).
                    </p>
                  )}
                </div>

                {/* Live Preview Pengurangan Otomatis Nominal Tidak Bisa Kembali */}
                {nomKunciAwal > 0 && (
                  <div className="p-3.5 rounded-xl bg-rose-50/75 border border-rose-200 space-y-1 font-mono text-[11px] tabular-nums">
                    <div className="font-sans font-bold text-rose-950 flex items-center gap-1.5 pb-1">
                      <Lock className="w-3.5 h-3.5 text-rose-700" />
                      <span>Otomatis Mengurangi Nominal Uang Tidak Bisa Kembali:</span>
                    </div>
                    <div className="flex justify-between text-zinc-600">
                      <span className="font-sans">Nominal Nota Kunci Saat Ini:</span>
                      <span className="font-bold text-rose-800">{formatRupiah(nomKunciAwal)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700">
                      <span className="font-sans">Berkurang Otomatis dari Pembayaran Ini:</span>
                      <span className="font-bold">- {formatRupiah(estPengurangKunci)}</span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t border-rose-200 text-zinc-900">
                      <span className="font-sans font-bold">Sisa Nominal Tidak Bisa Kembali:</span>
                      <span className={`font-extrabold ${estSisaKunci === 0 ? 'text-emerald-700' : 'text-rose-800'}`}>
                        {formatRupiah(estSisaKunci)}
                        {estSisaKunci === 0 ? ' (Lunas & Pulih)' : ''}
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-zinc-800 mb-1">
                    Keterangan Pembayaran
                  </label>
                  <input
                    type="text"
                    value={quickPayKeterangan}
                    onChange={(e) => setQuickPayKeterangan(e.target.value)}
                    placeholder="Contoh: Cicilan pembayaran nota kunci"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-zinc-800"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setQuickPayModal(null)}
                    disabled={quickPayBusy}
                    className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={quickPayBusy || nomInput <= 0 || isOver}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold cursor-pointer disabled:opacity-50"
                  >
                    {quickPayBusy
                      ? 'Memproses...'
                      : `Simpan Pembayaran (${formatRupiah(nomInput)})`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
      <ModalKliringSilangMitra
        isOpen={kliringModalOpen && Boolean(statement)}
        onClose={() => setKliringModalOpen(false)}
        initialMode={kliringInitialMode}
        mitra={
          statement
            ? {
                id: statement.idMitra,
                kode: statement.kodeMitra,
                nama: statement.namaMitra,
                totalBonMitra: statement.totalBonKeseluruhan || 0,
                nominalPiutangAktif: statement.nominalPiutangAktif,
                nominalNotaNgunci: statement.nominalNotaNgunci,
                totalHutangTitipPanen: statement.totalTitip || 0,
                totalTitipPanenMurni: statement.totalTitipPanenMurni,
                totalUpahBelumDibayar: statement.totalUpahBelumDibayar,
              }
            : null
        }
        rekeningList={rekeningList}
        onSuccess={(res, receipt) => {
          const netHutang = Math.max(0, res.saldoTitipanAkhir - res.sisaKasbonAkhir);
          const netPiutang = Math.max(0, res.sisaKasbonAkhir - res.saldoTitipanAkhir);
          const posLabel =
            netHutang > 0
              ? `Hutang ${formatRupiah(netHutang)}`
              : netPiutang > 0
                ? `Piutang ${formatRupiah(netPiutang)}`
                : 'Impas Rp 0';
          setEditSuccessMsg(
            res.nominalPotongSilang > 0
              ? `Kliring Silang ${res.namaMitra} berhasil (${formatRupiah(res.nominalPotongSilang)}). Yang Harus Dibayar sekarang: ${posLabel}.`
              : `Pengambilan uang titipan ${res.namaMitra} (${formatRupiah(res.nominalPenyelesaianFisik || 0)}) tanpa potong bon berhasil. Yang Harus Dibayar sekarang: ${posLabel}.`
          );
          loadStatementData(currentMitraId, true);
          window.dispatchEvent(new CustomEvent('erp:data-updated'));
          if (onRefreshParent) onRefreshParent();
          if (onSuccessReceipt) onSuccessReceipt(receipt);
        }}
      />
      {deleteTxTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden border border-zinc-200 shadow-2xl text-xs">
            <div className="p-4 bg-rose-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Trash2 className="w-4 h-4 text-rose-200" />
                <span>Konfirmasi Hapus Transaksi</span>
              </div>
              <button
                type="button"
                disabled={deletingTx}
                onClick={() => setDeleteTxTarget(null)}
                className="text-rose-200 hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3.5 text-zinc-700">
              <p className="leading-relaxed">
                Anda akan menghapus transaksi berikut dari Rekening Koran{' '}
                <strong className="text-zinc-950">{statement?.namaMitra}</strong>:
              </p>
              <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span className="font-mono font-bold text-zinc-900">{deleteTxTarget.idTransaksi}</span>
                  <span className="font-mono tabular-nums">{deleteTxTarget.tanggal}</span>
                </div>
                <div className="font-bold text-zinc-900 text-xs">{deleteTxTarget.uraian}</div>
                {deleteTxTarget.keterangan && (
                  <div className="text-[11px] text-zinc-600">{deleteTxTarget.keterangan}</div>
                )}
                <div className="pt-1.5 border-t border-zinc-200 flex items-center justify-between">
                  <span className="text-zinc-500">Nominal Tercatat:</span>
                  <span className="font-mono tabular-nums font-extrabold text-rose-800 text-sm">
                    {formatRupiah(deleteTxTarget.nominal)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                Saldo piutang/titipan mitra, saldo kas/bank PT, dan stok gudang terkait akan dikembalikan secara otomatis agar pembukuan tetap akurat.
              </p>
              {deleteTxError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-semibold text-[11px]">
                  {deleteTxError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  disabled={deletingTx}
                  onClick={() => setDeleteTxTarget(null)}
                  className="px-4 py-2 rounded-lg text-zinc-700 hover:bg-zinc-100 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={deletingTx}
                  onClick={async () => {
                    if (!deleteTxTarget) return;
                    setDeletingTx(true);
                    setDeleteTxError('');
                    try {
                      const res = await api.deleteTransactionUniversal(deleteTxTarget.idTransaksi);
                      setDeleteTxTarget(null);
                      setEditSuccessMsg(
                        `Transaksi ${res.idTransaksi} berhasil dihapus. Saldo mitra & rekening kas/bank telah disinkronkan otomatis.`
                      );
                      await loadStatementData(currentMitraId, true);
                      window.dispatchEvent(new CustomEvent('erp:data-updated'));
                      onRefreshParent?.();
                    } catch (err: any) {
                      setDeleteTxError(err.message || 'Gagal menghapus transaksi');
                    } finally {
                      setDeletingTx(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deletingTx ? 'Menghapus...' : 'Ya, Hapus Transaksi'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

