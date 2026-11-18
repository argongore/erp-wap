import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Briefcase,
  Layers,
  DollarSign,
  HandCoins,
  Receipt,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  Plus,
  FileSpreadsheet,
  Wheat,
  ShoppingBag,
  ArrowRight,
  Sparkles,
  Pencil,
  UserCog,
  Download,
  FileDown,
  Image as ImageIcon,
  FileText,
  ShieldCheck,
  ArrowDownCircle,
  ArrowUpCircle,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  DetailHarianKaryawanResponse,
  NamaDivisi,
  ProfilPerusahaan,
  Rekening,
  RekeningTitipAuditSummary,
  TransaksiPenggajian,
} from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import {
  ExportHistoryGajiFilter,
  buildLogCatatanDisplay,
  buildLogJobDisplay,
  exportHistoryGajiKaryawanToCsv,
  exportHistoryGajiKaryawanToImage,
  exportHistoryGajiKaryawanToPdf,
  exportHistoryGajiKaryawanToXlsx,
  extractEmployeePeriodsSafe,
  prepareHistoryGajiData,
} from '../../utils/exportHistoryGajiKaryawan.ts';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';
import {
  KaryawanAvatar,
  ModalPreviewFotoKaryawan,
  ModalProfilKaryawan,
} from './ModalProfilKaryawan.tsx';
import {
  exportRekeningTitipToCsv,
  exportRekeningTitipToImage,
  exportRekeningTitipToPdf,
  exportRekeningTitipToXlsx,
} from '../../utils/exportRekeningTitip.ts';

interface DetailHarianKaryawanModalProps {
  idKaryawan: string;
  rekeningList: Rekening[];
  onClose: () => void;
  onOpenInputKerja: (idKaryawan: string) => void;
  onRefreshAll: () => void;
}

export const DetailHarianKaryawanModal: React.FC<DetailHarianKaryawanModalProps> = ({
  idKaryawan,
  rekeningList,
  onClose,
  onOpenInputKerja,
  onRefreshAll,
}) => {
  const [detail, setDetail] = useState<DetailHarianKaryawanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'LOG_HARIAN' | 'MUTASI_BON' | 'RIWAYAT_GAJI' | 'REKENING_TITIP'>('LOG_HARIAN');
  const [selectedRekTitipKode, setSelectedRekTitipKode] = useState<string>('');
  const [titipFilterArah, setTitipFilterArah] = useState<'ALL' | 'MASUK' | 'BELANJA' | 'KEMBALI'>('ALL');

  // Settlement Form Modal State
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleDivisi, setSettleDivisi] = useState<NamaDivisi>('Gudang Wijaya Agro');
  const [settleRekening, setSettleRekening] = useState<string>('KAS01');
  const [settleTanggalBayar, setSettleTanggalBayar] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [settlePersenBon, setSettlePersenBon] = useState<number>(100);
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  const [settleError, setSettleError] = useState('');
  const [editTarget, setEditTarget] = useState<{ id: string; jenis: string } | null>(null);
  const [showProfilModal, setShowProfilModal] = useState(false);
  const [showPhotoZoom, setShowPhotoZoom] = useState(false);
  const [profilPerusahaan, setProfilPerusahaan] = useState<ProfilPerusahaan | null>(null);

  // Per-employee history download & filter state
  const [exportPeriodKey, setExportPeriodKey] = useState<string>('SEMUA');
  const [exportStatusKerja, setExportStatusKerja] = useState<'SEMUA' | 'BON' | 'LUNAS'>('SEMUA');
  const [downloadingFmt, setDownloadingFmt] = useState<'xlsx' | 'pdf' | 'jpg' | 'png' | 'csv' | null>(null);
  const [downloadingTitipFmt, setDownloadingTitipFmt] = useState<'xlsx' | 'pdf' | 'jpg' | 'png' | 'csv' | null>(null);
  const [downloadBanner, setDownloadBanner] = useState<string>('');

  const loadDetail = async () => {
    setLoading(true);
    try {
      const [res, profil] = await Promise.all([
        api.getDetailHarianKaryawan(idKaryawan),
        api.getProfilPerusahaan().catch(() => null),
      ]);
      setDetail(res);
      if (profil) setProfilPerusahaan(profil);
      setSettleDivisi(res.karyawan.divisiTerakhir || 'Gudang Wijaya Agro');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat detail harian karyawan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setExportPeriodKey('SEMUA');
    setExportStatusKerja('SEMUA');
    setDownloadBanner('');
    loadDetail();
  }, [idKaryawan]);

  const handleProcessSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSettleError('');
    setSettleSubmitting(true);
    try {
      const [sy, sm, sd] = (settleTanggalBayar || '').split('-');
      const formattedTanggalBayar =
        sy && sm && sd ? `${sd}/${sm}/${sy}` : settleTanggalBayar;

      await api.settleHakUpahKaryawan(idKaryawan, {
        divisi: settleDivisi,
        tanggalBayar: formattedTanggalBayar,
        tanggalKerja: formattedTanggalBayar,
        rekeningSumber: settleRekening,
        metodePembayaran:
          settleRekening === 'SINKRON'
            ? 'SINKRON'
            : settleRekening === 'KAS01'
            ? 'TUNAI'
            : 'TRANSFER',
        persentasePotongKasbon: settlePersenBon,
      });
      setShowSettleModal(false);
      onRefreshAll();
      loadDetail();
    } catch (err: any) {
      setSettleError(err.message || 'Gagal memproses settlement upah');
    } finally {
      setSettleSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
        <div className="bg-white p-6 rounded-2xl shadow-xl flex items-center space-x-3 text-xs">
          <span className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
          <span>Memuat detail harian karyawan...</span>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
        <div className="bg-white p-6 rounded-2xl shadow-xl text-center space-y-3 max-w-sm">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <p className="text-xs text-rose-700">{errorMsg || 'Data tidak ditemukan'}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 text-white text-xs rounded-lg font-semibold"
          >
            Tutup
          </button>
        </div>
      </div>
    );
  }

  const { karyawan, logHarian, riwayatGaji, riwayatKasbonBarang, riwayatKasbonUang } = detail;
  const pendingLogs = logHarian.filter((u) => u.status === 'TERCATAT');

  const availablePeriods = extractEmployeePeriodsSafe(detail);
  const activeExportFilter: ExportHistoryGajiFilter = (() => {
    if (exportPeriodKey !== 'SEMUA') {
      const [yStr, mStr] = exportPeriodKey.split('-');
      const tahun = Number(yStr);
      const bulan = Number(mStr);
      if (tahun && bulan) {
        return { periodeMode: 'BULAN_TAHUN', bulan, tahun, statusKerja: exportStatusKerja };
      }
    }
    return { periodeMode: 'SEMUA', statusKerja: exportStatusKerja };
  })();

  const preparedHistory = prepareHistoryGajiData(detail, activeExportFilter);
  const filteredLogHarian = preparedHistory.logs;
  const filteredRiwayatGaji = preparedHistory.slips;
  const filteredKasbonBarang = preparedHistory.kasbonBarang;
  const filteredKasbonUang = preparedHistory.kasbonUang;
  const filteredBayarBon = preparedHistory.bayarBon;
  const displayUangTitip = preparedHistory.uangTitipDisplay;
  const ringkasanTitip = preparedHistory.ringkasanUangTitip;
  const hasPiutangHutangOrTitip = preparedHistory.hasPiutangHutangOrTitip;
  const slipLookupMap = new Map<string, TransaksiPenggajian>();
  (riwayatGaji || []).forEach((s) => slipLookupMap.set(s.id, s));

  const handleDownloadHistory = async (fmt: 'xlsx' | 'pdf' | 'jpg' | 'png' | 'csv') => {
    setDownloadingFmt(fmt);
    setDownloadBanner('');
    try {
      const profil =
        profilPerusahaan || (await api.getProfilPerusahaan().catch(() => null));
      if (fmt === 'xlsx') {
        const fn = exportHistoryGajiKaryawanToXlsx(detail, profil, activeExportFilter);
        setDownloadBanner(`Berhasil mengunduh Excel: ${fn}`);
      } else if (fmt === 'pdf') {
        const res = await exportHistoryGajiKaryawanToPdf(detail, profil, activeExportFilter);
        setDownloadBanner(`Berhasil mengunduh PDF (${res.totalLogs} input kerja, ${res.totalSlips} slip): ${res.fileName}`);
      } else if (fmt === 'jpg' || fmt === 'png') {
        const res = await exportHistoryGajiKaryawanToImage(detail, profil, {
          format: fmt,
          filter: activeExportFilter,
        });
        setDownloadBanner(
          `Berhasil mengunduh gambar ${fmt.toUpperCase()} (${res.pageCount} halaman): ${res.filenames.join(', ')}`
        );
      } else if (fmt === 'csv') {
        const fn = exportHistoryGajiKaryawanToCsv(detail, activeExportFilter);
        setDownloadBanner(`Berhasil mengunduh CSV: ${fn}`);
      }
    } catch (err: any) {
      setDownloadBanner(`Gagal mengunduh: ${err?.message || 'Terjadi kesalahan'}`);
    } finally {
      setDownloadingFmt(null);
    }
  };

  const handleDownloadTitipHistory = async (
    fmt: 'xlsx' | 'pdf' | 'jpg' | 'png' | 'csv',
    activeTitip: RekeningTitipAuditSummary
  ) => {
    setDownloadingTitipFmt(fmt);
    setDownloadBanner('');
    try {
      const profil =
        profilPerusahaan || (await api.getProfilPerusahaan().catch(() => null));
      if (fmt === 'pdf') {
        const fn = await exportRekeningTitipToPdf(activeTitip, profil, {
          filterArah: titipFilterArah,
        });
        setDownloadBanner(`Berhasil mengunduh PDF Rek. Koran Titip (${activeTitip.kodeRekening}): ${fn}`);
      } else if (fmt === 'xlsx') {
        const fn = exportRekeningTitipToXlsx(activeTitip, profil, {
          filterArah: titipFilterArah,
        });
        setDownloadBanner(`Berhasil mengunduh Excel Rek. Koran Titip (${activeTitip.kodeRekening}): ${fn}`);
      } else if (fmt === 'jpg' || fmt === 'png') {
        const res = await exportRekeningTitipToImage(activeTitip, profil, {
          format: fmt,
          filterArah: titipFilterArah,
        });
        setDownloadBanner(
          `Berhasil mengunduh ${fmt.toUpperCase()} Rek. Koran Titip (${res.pageCount} hal.): ${res.filenames.join(', ')}`
        );
      } else if (fmt === 'csv') {
        const fn = exportRekeningTitipToCsv(activeTitip, { filterArah: titipFilterArah });
        setDownloadBanner(`Berhasil mengunduh CSV Rek. Koran Titip (${activeTitip.kodeRekening}): ${fn}`);
      }
    } catch (err: any) {
      setDownloadBanner(`Gagal mengunduh Rek. Koran Titip: ${err?.message || 'Terjadi kesalahan'}`);
    } finally {
      setDownloadingTitipFmt(null);
    }
  };

  const validRekeningList = rekeningList.filter(
    (r) =>
      r.status === 'AKTIF' &&
      !r.isVirtual &&
      r.kategori !== 'VIRTUAL_SISTEM' &&
      r.kategori !== 'OPERASIONAL_DIVISI' &&
      r.kode !== 'BON01' &&
      r.kode !== 'TIT01' &&
      r.kode !== 'SINKRON' &&
      (!r.kode.startsWith('REK-') ||
        Boolean(r.isAnakPerusahaan || r.kategori === 'ANAK_PERUSAHAAN' || r.isRekeningTitip || r.kategori === 'REKENING_TITIP'))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-zinc-200 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden text-zinc-900 flex flex-col max-h-[94vh] animate-in fade-in">
        {/* Modal Top Header */}
        <div className="p-4 bg-zinc-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800">
          <div className="flex items-center space-x-3">
            <KaryawanAvatar
              nama={karyawan.nama}
              fotoUrl={karyawan.fotoUrl}
              size="md"
              theme="dark"
              onClick={() => {
                if (karyawan.fotoUrl) setShowPhotoZoom(true);
                else setShowProfilModal(true);
              }}
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-sm text-white">{karyawan.nama}</h2>
                <span className="text-[10px] font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-300 border border-zinc-700">
                  {karyawan.nik}
                </span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 font-semibold px-2 py-0.5 rounded border border-emerald-800">
                  {karyawan.status}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {karyawan.jabatan} · Divisi Aktif:{' '}
                <strong className="text-amber-300">
                  {karyawan.divisi || karyawan.departemen || karyawan.divisiTerakhir}
                </strong>
              </p>
              {karyawan.riwayatDivisi && karyawan.riwayatDivisi.length > 0 && (
                <p className="text-[10px] text-emerald-300 mt-0.5">
                  Upgrade ({karyawan.riwayatDivisi[karyawan.riwayatDivisi.length - 1].periodeBulan || karyawan.riwayatDivisi[karyawan.riwayatDivisi.length - 1].tanggal}):{' '}
                  {karyawan.riwayatDivisi[karyawan.riwayatDivisi.length - 1].divisiSebelumnya} →{' '}
                  {karyawan.riwayatDivisi[karyawan.riwayatDivisi.length - 1].divisiBaru}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowProfilModal(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-sky-300 border border-zinc-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              title="Update Profil, Foto & Upgrade Divisi Karyawan"
            >
              <UserCog className="w-3.5 h-3.5" />
              <span>Profil, Foto &amp; Divisi</span>
            </button>
            <button
              onClick={() => window.print()}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="Cetak Rekap Karyawan"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Financial KPI Banner */}
        <div
          className={`grid grid-cols-2 ${
            hasPiutangHutangOrTitip ? 'sm:grid-cols-5' : 'sm:grid-cols-4'
          } gap-2.5 p-4 bg-zinc-50 border-b border-zinc-200 text-xs`}
        >
          {/* Card 1: Hak Upah Berjalan */}
          <div className="p-3 bg-white rounded-xl border border-zinc-200 space-y-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              Hak Upah Berjalan
            </span>
            <div className="text-base font-black font-mono text-emerald-700">
              +{formatRupiah(karyawan.totalUpahBelumDibayar)}
            </div>
            <span className="text-[10px] text-zinc-500 block truncate">
              {pendingLogs.length} Hari Kerja Belum Dicairkan
            </span>
          </div>

          {/* Card 2: Total Bon Barang */}
          <div className="p-3 bg-white rounded-xl border border-zinc-200 space-y-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              Bon Barang Toko
            </span>
            <div className="text-base font-black font-mono text-rose-700">
              -{formatRupiah(karyawan.totalKasbonBarang)}
            </div>
            <span className="text-[10px] text-zinc-500 block truncate">
              Pupuk/Saprotan/Hasil Bumi
            </span>
          </div>

          {/* Card 3: Total Bon Uang */}
          <div className="p-3 bg-white rounded-xl border border-zinc-200 space-y-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              Bon Pinjaman Uang
            </span>
            <div className="text-base font-black font-mono text-amber-700">
              -{formatRupiah(karyawan.totalKasbonUang)}
            </div>
            <span className="text-[10px] text-zinc-500 block truncate">
              Kasbon Uang Tunai/Transfer
            </span>
          </div>

          {/* Card 4 (Optional): Uang Titip / Hutang PT */}
          {hasPiutangHutangOrTitip && (
            <div className="p-3 bg-violet-50/80 rounded-xl border border-violet-200 space-y-1">
              <span className="text-[10px] font-bold text-violet-800 uppercase tracking-wider block">
                Uang Titip (Hutang PT)
              </span>
              <div className="text-base font-black font-mono text-violet-800">
                +{formatRupiah(ringkasanTitip.saldoTitipAktif)}
              </div>
              <span className="text-[10px] text-violet-700 block truncate">
                Masuk {formatRupiah(ringkasanTitip.totalTitipMasuk)} · Ambil{' '}
                {formatRupiah(ringkasanTitip.totalTitipDicairkan)}
              </span>
            </div>
          )}

          {/* Card 5: Posisi Bersih */}
          <div
            className={`p-3 rounded-xl border space-y-1 ${
              (hasPiutangHutangOrTitip
                ? ringkasanTitip.saldoBersihTerpadu > 0
                : karyawan.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH')
                ? 'bg-purple-50/80 border-purple-200 text-purple-950'
                : (hasPiutangHutangOrTitip
                    ? ringkasanTitip.saldoBersihTerpadu < 0
                    : karyawan.posisiStatus === 'KARYAWAN_BERHUTANG_BON')
                ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider block">
              {hasPiutangHutangOrTitip
                ? ringkasanTitip.saldoBersihTerpadu > 0
                  ? 'SALDO TERPADU (HUTANG PT)'
                  : ringkasanTitip.saldoBersihTerpadu < 0
                  ? 'SALDO TERPADU (PIUTANG/BON)'
                  : 'POSISI IMPAS / LUNAS'
                : karyawan.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH'
                ? 'SISA HAK UPAH BERSIH'
                : karyawan.posisiStatus === 'KARYAWAN_BERHUTANG_BON'
                ? 'SISA HUTANG BON'
                : 'POSISI IMPAS / LUNAS'}
            </span>
            <div className="text-base font-black font-mono">
              {formatRupiah(
                Math.abs(
                  hasPiutangHutangOrTitip
                    ? ringkasanTitip.saldoBersihTerpadu
                    : karyawan.saldoBersih
                )
              )}
            </div>
            <span className="text-[10px] opacity-80 block truncate">
              {hasPiutangHutangOrTitip
                ? `Upah + Titip - Bon`
                : karyawan.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH'
                ? 'Perusahaan wajib bayar'
                : karyawan.posisiStatus === 'KARYAWAN_BERHUTANG_BON'
                ? 'Bon melebihi hak upah'
                : 'Bebas kewajiban'}
            </span>
          </div>
        </div>

        {/* Strip Info Rekening Titip Uang Perusahaan (Jika karyawan memegang amanah Rekening Titip) */}
        {detail.rekeningTitipList && detail.rekeningTitipList.length > 0 && (
          <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2 text-sky-950">
              <ShieldCheck className="w-4 h-4 text-sky-700 shrink-0" />
              <div>
                <span className="font-bold">
                  Pemegang Amanah Rekening Titip Uang PT ({detail.rekeningTitipList.length} Rekening):
                </span>{' '}
                {detail.rekeningTitipList.map((t, idx) => (
                  <span key={t.kodeRekening} className="font-mono text-[11px]">
                    {idx > 0 ? ' · ' : ''}
                    <strong>{t.kodeRekening}</strong> (Sisa {formatRupiah(t.saldoSaatIni)})
                  </span>
                ))}
                <span className="text-[11px] text-sky-800 ml-1.5">
                  — Terpisah dari gaji/kasbon pribadi
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('REKENING_TITIP')}
              className="px-3 py-1 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-[11px] font-bold cursor-pointer shrink-0"
            >
              Audit Belanja Rekening Titip &rarr;
            </button>
          </div>
        )}

        {/* Download Detail History Penggajian Bar */}
        <div className="px-4 py-2.5 bg-emerald-50/70 border-b border-emerald-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-1.5 text-emerald-950 font-bold">
              <Download className="w-3.5 h-3.5 text-emerald-700" />
              <span>Unduh Detail History Gaji:</span>
            </div>

            <select
              value={exportPeriodKey}
              onChange={(e) => setExportPeriodKey(e.target.value)}
              className="bg-white border border-emerald-300 text-zinc-800 rounded-lg px-2 py-1 text-[11px] font-semibold focus:outline-hidden focus:border-emerald-600"
              title="Pilih periode history yang ingin ditampilkan & diunduh"
            >
              <option value="SEMUA">Semua Periode ({logHarian.length} Input)</option>
              {availablePeriods.map((p) => (
                <option key={p.key} value={p.key}>
                  Bulan {p.label}
                </option>
              ))}
            </select>

            <select
              value={exportStatusKerja}
              onChange={(e) => setExportStatusKerja(e.target.value as 'SEMUA' | 'BON' | 'LUNAS')}
              className="bg-white border border-emerald-300 text-zinc-800 rounded-lg px-2 py-1 text-[11px] font-semibold focus:outline-hidden focus:border-emerald-600"
              title="Filter status pembayaran upah harian"
            >
              <option value="SEMUA">Semua Status (BON + LUNAS)</option>
              <option value="BON">Hanya Belum Cair (BON)</option>
              <option value="LUNAS">Hanya Sudah Cair (LUNAS)</option>
            </select>

            <span className="text-[10px] text-emerald-800 font-mono">
              ({filteredLogHarian.length} Log · {filteredRiwayatGaji.length} Slip)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={Boolean(downloadingFmt)}
              onClick={() => handleDownloadHistory('xlsx')}
              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              title="Unduh file Excel (.xlsx) berisi 4 sheet lengkap (Ringkasan, Detail Input Kerja, Slip Gaji, Kasbon)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{downloadingFmt === 'xlsx' ? '...' : 'Excel'}</span>
            </button>

            <button
              type="button"
              disabled={Boolean(downloadingFmt)}
              onClick={() => handleDownloadHistory('pdf')}
              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-[11px] font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              title="Unduh dokumen PDF (.pdf) siap cetak"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>{downloadingFmt === 'pdf' ? '...' : 'PDF'}</span>
            </button>

            <button
              type="button"
              disabled={Boolean(downloadingFmt)}
              onClick={() => handleDownloadHistory('jpg')}
              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              title="Unduh gambar JPG untuk kirim WhatsApp"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>{downloadingFmt === 'jpg' ? '...' : 'JPG'}</span>
            </button>

            <button
              type="button"
              disabled={Boolean(downloadingFmt)}
              onClick={() => handleDownloadHistory('png')}
              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-[11px] font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              title="Unduh gambar PNG resolusi tinggi"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>{downloadingFmt === 'png' ? '...' : 'PNG'}</span>
            </button>

            <button
              type="button"
              disabled={Boolean(downloadingFmt)}
              onClick={() => handleDownloadHistory('csv')}
              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-300 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
              title="Unduh data CSV"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{downloadingFmt === 'csv' ? '...' : 'CSV'}</span>
            </button>
          </div>
        </div>

        {downloadBanner && (
          <div className="px-4 py-1.5 bg-emerald-950 text-emerald-200 text-[11px] flex items-center justify-between">
            <span>{downloadBanner}</span>
            <button
              type="button"
              onClick={() => setDownloadBanner('')}
              className="text-emerald-400 hover:text-white font-bold ml-3 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Quick Action Buttons Bar */}
        <div className="px-4 py-2.5 bg-white border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2">
          {/* Navigation Tabs */}
          <div className="flex items-center space-x-1 text-xs">
            <button
              onClick={() => setActiveTab('LOG_HARIAN')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'LOG_HARIAN'
                  ? 'bg-zinc-900 text-white shadow-2xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Log Kerja Harian ({filteredLogHarian.length})
            </button>
            <button
              onClick={() => setActiveTab('MUTASI_BON')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'MUTASI_BON'
                  ? 'bg-zinc-900 text-white shadow-2xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Mutasi Bon &amp; Titip ({filteredKasbonBarang.length + filteredKasbonUang.length + displayUangTitip.length})
            </button>
            <button
              onClick={() => setActiveTab('RIWAYAT_GAJI')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'RIWAYAT_GAJI'
                  ? 'bg-zinc-900 text-white shadow-2xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Slip Gaji Cair ({filteredRiwayatGaji.length})
            </button>
            {detail.rekeningTitipList && detail.rekeningTitipList.length > 0 && (
              <button
                onClick={() => setActiveTab('REKENING_TITIP')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center space-x-1 ${
                  activeTab === 'REKENING_TITIP'
                    ? 'bg-sky-800 text-white shadow-2xs'
                    : 'bg-sky-50 text-sky-900 border border-sky-200 hover:bg-sky-100'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Rekening Titip ({detail.rekeningTitipList.length})</span>
              </button>
            )}
          </div>

          {/* Action CTAs */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onOpenInputKerja(karyawan.id)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Input Kerja Hari Ini</span>
            </button>

            {pendingLogs.length > 0 && (
              <button
                onClick={() => setShowSettleModal(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Cairkan {pendingLogs.length} Hari Kerja &amp; Potong Bon</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="p-4 overflow-y-auto flex-1 text-xs">
          {/* TAB 1 (UTAMA / ATAS): Detail Input Penggajian & Pekerjaan Harian */}
          {activeTab === 'LOG_HARIAN' && (
            <div className="space-y-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-zinc-500 text-[11px]">
                  <span>Daftar penugasan divisi, item pekerjaan, dan keterangan yang diinput admin per hari</span>
                  <span className="font-semibold text-emerald-800">
                    Total Upah ({preparedHistory.scopeLabel}): {formatRupiah(preparedHistory.totalUpahTercatat)}
                  </span>
                </div>

                <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-zinc-100 border-b border-zinc-200 text-zinc-700 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">TANGGAL / HARI</th>
                        <th className="py-2.5 px-3">DIVISI</th>
                        <th className="py-2.5 px-3">ITEM PEKERJAAN</th>
                        <th className="py-2.5 px-2 text-center w-14">QTY</th>
                        <th className="py-2.5 px-3 text-right">HARGA</th>
                        <th className="py-2.5 px-3 text-right">JUMLAH</th>
                        <th className="py-2.5 px-2 text-center w-16">KET</th>
                        <th className="py-2.5 px-3">KETERANGAN / CATATAN</th>
                        <th className="py-2.5 px-2 text-center">AKSI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-zinc-800 text-[11px]">
                      {filteredLogHarian.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-6 text-center text-zinc-400">
                            Belum ada log pekerjaan harian tercatat sesuai filter ini
                          </td>
                        </tr>
                      ) : (
                        filteredLogHarian.map((log) => {
                          const qty = log.kuantiti !== undefined ? log.kuantiti : (log.totalUpahHarian > 0 ? 1 : 0);
                          const harga = log.harga !== undefined ? log.harga : log.upahHarian;
                          const jumlah = log.jumlah !== undefined ? log.jumlah : log.totalUpahHarian;
                          const isBon = log.ket === 'BON' || log.status === 'TERCATAT';
                          const linkedSlip = log.idPayrollSettlement
                            ? slipLookupMap.get(log.idPayrollSettlement)
                            : undefined;

                          return (
                            <tr key={log.id} className="hover:bg-zinc-50/80 transition-colors">
                              <td className="py-2.5 px-3 font-mono font-bold text-zinc-800 whitespace-nowrap">
                                {log.hariTanggal || log.tanggalKerja}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-zinc-100 text-zinc-800 border border-zinc-200">
                                  {log.divisiKode || log.divisi}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-medium text-zinc-900 uppercase">
                                {buildLogJobDisplay(log)}
                              </td>
                              <td className="py-2.5 px-2 text-center font-mono font-bold">
                                {qty}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-zinc-600">
                                {formatRupiah(harga)}
                              </td>
                              <td className={`py-2.5 px-3 text-right font-mono font-bold ${jumlah > 0 ? 'text-emerald-700' : 'text-zinc-500'}`}>
                                {formatRupiah(jumlah)}
                              </td>
                              <td className="py-2.5 px-2 text-center whitespace-nowrap">
                                {isBon ? (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                    BON
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-black bg-sky-100 text-sky-800 border border-sky-300">
                                    LUNAS
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-zinc-700 text-xs">
                                {buildLogCatatanDisplay(log, linkedSlip)}
                              </td>
                              <td className="py-2.5 px-2 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setEditTarget({ id: log.id, jenis: 'UPAH_HARIAN' })}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-900 text-zinc-700 hover:text-white border border-zinc-200 text-[10px] font-semibold cursor-pointer"
                                >
                                  <Pencil className="w-2.5 h-2.5" />
                                  <span>Edit</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detail Uang Titip & Mutasi Piutang/Hutang (Ditampilkan di bawah Detail Input Penggajian bila ada titip, hutang, atau piutang) */}
              {hasPiutangHutangOrTitip && (
                <div className="border border-violet-200 bg-violet-50/40 rounded-xl overflow-hidden shadow-2xs">
                  <div className="px-3.5 py-2.5 bg-violet-100/80 border-b border-violet-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <Scale className="w-4 h-4 text-violet-700 shrink-0" />
                      <div>
                        <h3 className="font-bold text-violet-950 text-xs">
                          Detail Uang Titip (Titipan Sisa Gaji / Dana) &amp; Pengambilan / Piutang
                        </h3>
                        <p className="text-[10px] text-violet-800">
                          Menampilkan riwayat titipan sisa gaji/dana sebelumnya (hutang PT) serta pengambilan/kliring piutang berjalan
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                      <span className="px-2 py-0.5 rounded bg-white border border-violet-200 text-emerald-800 font-bold">
                        Titip Masuk: +{formatRupiah(ringkasanTitip.totalTitipMasuk)}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-white border border-violet-200 text-amber-800 font-bold">
                        Diambil/Kliring: -{formatRupiah(ringkasanTitip.totalTitipDicairkan)}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-violet-700 text-white font-bold">
                        Sisa Uang Titip: {formatRupiah(ringkasanTitip.saldoTitipAktif)}
                      </span>
                      {ringkasanTitip.totalBonAktif > 0 && (
                        <span className="px-2 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 font-bold">
                          Bon Aktif: -{formatRupiah(ringkasanTitip.totalBonAktif)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveTab('MUTASI_BON')}
                        className="px-2 py-0.5 rounded bg-white hover:bg-violet-200 border border-violet-300 text-violet-900 font-sans font-semibold cursor-pointer"
                      >
                        Lihat Semua Mutasi →
                      </button>
                    </div>
                  </div>

                  {preparedHistory.isMonthFiltered && preparedHistory.saldoTitipSebelumPeriode > 0 && (
                    <div className="px-3.5 py-1.5 bg-violet-50 border-b border-violet-200/70 text-[11px] text-violet-900 flex items-center justify-between">
                      <span>Saldo Uang Titip Sebelumnya (akumulasi sebelum periode ini):</span>
                      <strong className="font-mono">{formatRupiah(preparedHistory.saldoTitipSebelumPeriode)}</strong>
                    </div>
                  )}

                  {displayUangTitip.length === 0 ? (
                    <div className="px-4 py-3 text-[11px] text-violet-900/80 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Saldo Uang Titip = <strong>Rp 0</strong> (Belum ada catatan titipan dana/sisa gaji; karyawan saat ini memiliki catatan bon/piutang sebesar{' '}
                        <strong className="font-mono text-rose-700">{formatRupiah(ringkasanTitip.totalBonAktif)}</strong>).
                      </span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-white">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-violet-50 border-b border-violet-200 text-violet-900 font-bold uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="py-2 px-3">TANGGAL</th>
                            <th className="py-2 px-3">NO. REF</th>
                            <th className="py-2 px-3">JENIS &amp; URAIAN UANG TITIP</th>
                            <th className="py-2 px-3">METODE</th>
                            <th className="py-2 px-3 text-right">TITIP MASUK (+)</th>
                            <th className="py-2 px-3 text-right">AMBIL / KLIRING (-)</th>
                            <th className="py-2 px-3 text-right">SALDO TITIP</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-violet-100 text-[11px] text-zinc-800">
                          {displayUangTitip.map((t) => (
                            <tr key={t.id} className="hover:bg-violet-50/40">
                              <td className="py-2 px-3 font-mono font-semibold whitespace-nowrap">
                                {t.tanggal}
                              </td>
                              <td className="py-2 px-3 font-mono text-[10px] text-violet-800 whitespace-nowrap">
                                {t.id}
                              </td>
                              <td className="py-2 px-3">
                                <div className="font-semibold text-zinc-900">{t.judul}</div>
                                <div className="text-[10px] text-zinc-600">
                                  {t.keterangan}
                                  {t.noReferensi ? ` · Ref: ${t.noReferensi}` : ''}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-[10px] font-mono text-zinc-600 whitespace-nowrap">
                                {t.metode} ({t.rekeningKode})
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                                {t.nominalMasuk > 0 ? `+${formatRupiah(t.nominalMasuk)}` : '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-amber-700 whitespace-nowrap">
                                {t.nominalKeluar > 0 ? `-${formatRupiah(t.nominalKeluar)}` : '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-black text-violet-900 whitespace-nowrap">
                                {formatRupiah(t.saldoTitipSetelah)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Mutasi Bon & Detail Uang Titip Karyawan */}
          {activeTab === 'MUTASI_BON' && (
            <div className="space-y-4">
              {/* 0. Detail Uang Titip (Titipan Sisa Gaji / Dana & Pengambilan) */}
              <div className="space-y-2">
                <h3 className="font-bold text-violet-900 text-xs flex items-center space-x-2">
                  <Scale className="w-4 h-4 text-violet-700" />
                  <span>0. Detail Uang Titip (Titipan Sisa Gaji / Dana) &amp; Pengambilan / Kliring</span>
                </h3>
                <div className="border border-violet-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-violet-50 border-b border-violet-200 text-violet-900 font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2 px-3">ID TRANSAKSI</th>
                        <th className="py-2 px-3">TANGGAL</th>
                        <th className="py-2 px-3">JENIS &amp; KETERANGAN</th>
                        <th className="py-2 px-3">METODE / REK</th>
                        <th className="py-2 px-3 text-right">TITIP MASUK</th>
                        <th className="py-2 px-3 text-right">AMBIL / KLIRING</th>
                        <th className="py-2 px-3 text-right">SALDO TITIP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-violet-100 text-zinc-800 text-[11px]">
                      {displayUangTitip.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-4 text-center text-zinc-400">
                            Tidak ada transaksi uang titip / pencairan titipan pada karyawan ini
                          </td>
                        </tr>
                      ) : (
                        displayUangTitip.map((t) => (
                          <tr key={t.id}>
                            <td className="py-2 px-3 font-mono font-bold text-violet-800">{t.id}</td>
                            <td className="py-2 px-3 font-mono">{t.tanggal}</td>
                            <td className="py-2 px-3">
                              <div className="font-semibold text-zinc-900">{t.judul}</div>
                              <div className="text-[10px] text-zinc-600">{t.keterangan}</div>
                            </td>
                            <td className="py-2 px-3 font-mono text-[10px]">{t.metode} ({t.rekeningKode})</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                              {t.nominalMasuk > 0 ? `+${formatRupiah(t.nominalMasuk)}` : '-'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-amber-700">
                              {t.nominalKeluar > 0 ? `-${formatRupiah(t.nominalKeluar)}` : '-'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-black text-violet-900">
                              {formatRupiah(t.saldoTitipSetelah)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Kasbon Barang Toko */}
              <div className="space-y-2">
                <h3 className="font-bold text-zinc-800 text-xs flex items-center space-x-2">
                  <ShoppingBag className="w-4 h-4 text-emerald-700" />
                  <span>1. Kasbon Barang dari Kasir Toko Saprotan</span>
                </h3>
                <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2 px-3">NO NOTA</th>
                        <th className="py-2 px-3">TANGGAL</th>
                        <th className="py-2 px-3">RINCIAN BARANG</th>
                        <th className="py-2 px-3 text-right">TOTAL TAGIHAN</th>
                        <th className="py-2 px-3 text-right">SISA KASBON</th>
                        <th className="py-2 px-3 text-center">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-zinc-800">
                      {filteredKasbonBarang.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-zinc-400">
                            Tidak ada riwayat kasbon barang toko pada cakupan filter ini
                          </td>
                        </tr>
                      ) : (
                        filteredKasbonBarang.map((p) => (
                          <tr key={p.noPenjualan}>
                            <td className="py-2 px-3 font-mono font-bold">{p.noPenjualan}</td>
                            <td className="py-2 px-3">{p.tanggal}</td>
                            <td className="py-2 px-3">
                              <div className="space-y-1">
                                {p.items?.map((it: any, idx: number) => (
                                  <div key={idx} className="flex items-center justify-between text-[11px] gap-2">
                                    <span className="font-semibold text-zinc-900">• {it.namaProduk || it.nama}</span>
                                    <span className="font-mono text-zinc-600">
                                      {it.qty} {it.satuan} &times; {formatRupiah(it.harga || 0)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono">{formatRupiah(p.totalNominal)}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-rose-700">
                              {formatRupiah(p.sisaPiutang)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  p.statusPembayaran === 'LUNAS'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {p.statusPembayaran}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Kasbon Uang Tunai */}
              <div className="space-y-2">
                <h3 className="font-bold text-zinc-800 text-xs flex items-center space-x-2">
                  <HandCoins className="w-4 h-4 text-amber-700" />
                  <span>2. Kasbon Uang Tunai / Pinjaman dari Kasir</span>
                </h3>
                <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2 px-3">ID TRANSAKSI</th>
                        <th className="py-2 px-3">TANGGAL</th>
                        <th className="py-2 px-3">KETERANGAN</th>
                        <th className="py-2 px-3">SUMBER</th>
                        <th className="py-2 px-3 text-right">PINJAMAN</th>
                        <th className="py-2 px-3 text-right">SISA KASBON</th>
                        <th className="py-2 px-3 text-center">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-zinc-800">
                      {filteredKasbonUang.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-4 text-center text-zinc-400">
                            Tidak ada riwayat pinjaman kasbon uang pada cakupan filter ini
                          </td>
                        </tr>
                      ) : (
                        filteredKasbonUang.map((k) => (
                          <tr key={k.idTransaksi}>
                            <td className="py-2 px-3 font-mono font-bold">{k.idTransaksi}</td>
                            <td className="py-2 px-3">{k.tanggal}</td>
                            <td className="py-2 px-3">{k.keterangan}</td>
                            <td className="py-2 px-3">{k.rekeningSumber} ({k.metode})</td>
                            <td className="py-2 px-3 text-right font-mono">{formatRupiah(k.nominal)}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-amber-700">
                              {formatRupiah(k.sisaKasbon)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  k.status === 'LUNAS'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {k.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pembayaran / Potong Bon */}
              {filteredBayarBon.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-bold text-zinc-800 text-xs flex items-center space-x-2">
                    <Receipt className="w-4 h-4 text-sky-700" />
                    <span>3. Riwayat Pembayaran / Potongan / Kliring Bon</span>
                  </h3>
                  <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-2 px-3">ID TRANSAKSI</th>
                          <th className="py-2 px-3">TANGGAL</th>
                          <th className="py-2 px-3">KETERANGAN</th>
                          <th className="py-2 px-3">METODE / REK</th>
                          <th className="py-2 px-3 text-right">NOMINAL BAYAR</th>
                          <th className="py-2 px-3 text-right">SISA BON SETELAH</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 text-zinc-800 text-[11px]">
                        {filteredBayarBon.map((p) => (
                          <tr key={p.idTransaksi}>
                            <td className="py-2 px-3 font-mono font-bold">{p.idTransaksi}</td>
                            <td className="py-2 px-3 font-mono">{p.tanggal}</td>
                            <td className="py-2 px-3">{p.keterangan || '-'}</td>
                            <td className="py-2 px-3 font-mono text-[10px]">
                              {p.metode} ({p.rekeningTujuan})
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                              -{formatRupiah(p.nominalBayar)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-zinc-900">
                              {formatRupiah(p.sisaBonSetelah)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Riwayat Slip Gaji */}
          {activeTab === 'RIWAYAT_GAJI' && (
            <div className="space-y-3">
              <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">NO SLIP GAJI</th>
                      <th className="py-2.5 px-3">TANGGAL</th>
                      <th className="py-2.5 px-3">DIVISI</th>
                      <th className="py-2.5 px-3 text-right">UPAH KOTOR</th>
                      <th className="py-2.5 px-3 text-right">POTONG BON</th>
                      <th className="py-2.5 px-3 text-right">BERSIH DIBAYAR</th>
                      <th className="py-2.5 px-3">SUMBER KAS</th>
                      <th className="py-2.5 px-3 text-center">AKSI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-zinc-800">
                    {filteredRiwayatGaji.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-zinc-400">
                          Belum ada slip gaji yang dicairkan pada cakupan filter ini
                        </td>
                      </tr>
                    ) : (
                      filteredRiwayatGaji.map((g) => (
                        <tr key={g.id} className="hover:bg-zinc-50/80">
                          <td className="py-2.5 px-3 font-mono font-bold text-zinc-900">{g.slipNomor}</td>
                          <td className="py-2.5 px-3">{g.tanggal}</td>
                          <td className="py-2.5 px-3 font-semibold">{g.divisi}</td>
                          <td className="py-2.5 px-3 text-right font-mono">{formatRupiah(g.totalGajiKotor)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-700">
                            {g.potonganKasbon > 0 ? `-${formatRupiah(g.potonganKasbon)}` : 'Rp 0'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700">
                            {formatRupiah(g.gajiBersihDibayar)}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-600">{g.rekeningSumber} ({g.metodePembayaran})</td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setEditTarget({ id: g.id, jenis: 'PENGGAJIAN' })}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-900 text-zinc-700 hover:text-white border border-zinc-200 text-[10px] font-semibold cursor-pointer"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                              <span>Edit</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: Audit Rekening Titip Uang Perusahaan yang Dikelola Karyawan */}
          {activeTab === 'REKENING_TITIP' && detail.rekeningTitipList && detail.rekeningTitipList.length > 0 && (() => {
            const titipList: RekeningTitipAuditSummary[] = detail.rekeningTitipList;
            const activeTitip =
              titipList.find((t) => t.kodeRekening === selectedRekTitipKode) || titipList[0];
            const filteredMutasi = (activeTitip?.mutasi || []).filter((m) =>
              titipFilterArah === 'ALL' ? true : m.arah === titipFilterArah
            );

            return (
              <div className="space-y-4">
                {titipList.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {titipList.map((t) => (
                      <button
                        key={t.kodeRekening}
                        type="button"
                        onClick={() => setSelectedRekTitipKode(t.kodeRekening)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer border ${
                          activeTitip.kodeRekening === t.kodeRekening
                            ? 'bg-sky-800 text-white border-sky-800'
                            : 'bg-white text-sky-900 border-sky-200 hover:bg-sky-50'
                        }`}
                      >
                        {t.namaRekening} ({t.kodeRekening}) — {formatRupiah(t.saldoSaatIni)}
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-emerald-900 uppercase">
                      <span>Total Dititipkan (+)</span>
                      <ArrowDownCircle className="w-3.5 h-3.5 text-emerald-700" />
                    </div>
                    <div className="text-sm font-black font-mono text-emerald-800">
                      +{formatRupiah(activeTitip.saldoAwal + activeTitip.totalDititipkanMasuk)}
                    </div>
                    <div className="text-[10px] text-emerald-800/80">
                      {activeTitip.jumlahTransaksiMasuk} Setoran Dana PT
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-amber-900 uppercase">
                      <span>Sudah Dibelanjakan (-)</span>
                      <ArrowUpCircle className="w-3.5 h-3.5 text-amber-700" />
                    </div>
                    <div className="text-sm font-black font-mono text-amber-900">
                      -{formatRupiah(activeTitip.totalDibelanjakanKeluar)}
                    </div>
                    <div className="text-[10px] text-amber-800/80">
                      {activeTitip.jumlahTransaksiBelanja} Transaksi Belanja / Biaya
                    </div>
                  </div>

                  <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-zinc-700 uppercase">
                      <span>Dikembalikan ke PT (-)</span>
                      <RotateCcw className="w-3.5 h-3.5 text-zinc-600" />
                    </div>
                    <div className="text-sm font-black font-mono text-zinc-800">
                      -{formatRupiah(activeTitip.totalDikembalikanKePt)}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {activeTitip.jumlahTransaksiKembali} Transfer Balik ke PT
                    </div>
                  </div>

                  <div className="p-3 bg-sky-50 border-2 border-sky-300 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-sky-900 uppercase">
                      <span>Sisa Saldo Titip</span>
                      <Wallet className="w-3.5 h-3.5 text-sky-700" />
                    </div>
                    <div className="text-sm font-black font-mono text-sky-950">
                      {formatRupiah(activeTitip.saldoSaatIni)}
                    </div>
                    <div className="text-[10px] text-sky-800">
                      {activeTitip.kodeRekening} · {activeTitip.namaRekening}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { key: 'ALL', label: `Semua (${activeTitip.mutasi.length})` },
                        { key: 'MASUK', label: `Dana Masuk (+)` },
                        { key: 'BELANJA', label: `Dibelanjakan (-)` },
                        { key: 'KEMBALI', label: `Kembali ke PT (-)` },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setTitipFilterArah(f.key)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                          titipFilterArah === f.key
                            ? 'bg-sky-800 text-white'
                            : 'bg-white text-zinc-700 border border-sky-200 hover:bg-sky-100'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-sky-950 flex items-center gap-1 mr-0.5">
                      <Download className="w-3.5 h-3.5 text-sky-700" />
                      <span>Unduh RK Titip:</span>
                    </span>
                    <button
                      type="button"
                      disabled={Boolean(downloadingTitipFmt)}
                      onClick={() => handleDownloadTitipHistory('pdf', activeTitip)}
                      className="inline-flex items-center space-x-1 px-2 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      <FileDown className="w-3 h-3" />
                      <span>{downloadingTitipFmt === 'pdf' ? '...' : 'PDF'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(downloadingTitipFmt)}
                      onClick={() => handleDownloadTitipHistory('xlsx', activeTitip)}
                      className="inline-flex items-center space-x-1 px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      <FileSpreadsheet className="w-3 h-3" />
                      <span>{downloadingTitipFmt === 'xlsx' ? '...' : 'Excel'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(downloadingTitipFmt)}
                      onClick={() => handleDownloadTitipHistory('jpg', activeTitip)}
                      className="inline-flex items-center space-x-1 px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      <ImageIcon className="w-3 h-3" />
                      <span>{downloadingTitipFmt === 'jpg' ? '...' : 'JPG'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(downloadingTitipFmt)}
                      onClick={() => handleDownloadTitipHistory('png', activeTitip)}
                      className="inline-flex items-center space-x-1 px-2 py-1 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      <ImageIcon className="w-3 h-3" />
                      <span>{downloadingTitipFmt === 'png' ? '...' : 'PNG'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(downloadingTitipFmt)}
                      onClick={() => handleDownloadTitipHistory('csv', activeTitip)}
                      className="inline-flex items-center space-x-1 px-2 py-1 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-300 rounded-lg text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <FileText className="w-3 h-3" />
                      <span>{downloadingTitipFmt === 'csv' ? '...' : 'CSV'}</span>
                    </button>
                  </div>
                </div>

                <div className="border border-sky-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-sky-50 border-b border-sky-200 text-sky-950 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2 px-3">Tanggal</th>
                        <th className="py-2 px-3">Jenis</th>
                        <th className="py-2 px-3">Pihak / Rincian Belanja</th>
                        <th className="py-2 px-3 text-right">Masuk (+)</th>
                        <th className="py-2 px-3 text-right">Belanja / Keluar (-)</th>
                        <th className="py-2 px-3 text-right">Sisa Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-[11px]">
                      {filteredMutasi.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-zinc-400">
                            Belum ada mutasi pada Rekening Titip Uang ini
                          </td>
                        </tr>
                      ) : (
                        filteredMutasi.map((m) => (
                          <tr key={`${m.id}-${m.modulSumber}`} className="hover:bg-sky-50/40 align-top">
                            <td className="py-2 px-3 whitespace-nowrap">
                              <div className="font-mono font-bold text-zinc-800">{m.tanggal}</div>
                              <div className="text-[10px] text-zinc-400">{m.jam}</div>
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  m.arah === 'MASUK'
                                    ? 'bg-emerald-100 text-emerald-900'
                                    : m.arah === 'KEMBALI'
                                    ? 'bg-zinc-200 text-zinc-800'
                                    : 'bg-amber-100 text-amber-900'
                                }`}
                              >
                                {m.jenis}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <div className="font-semibold text-zinc-900">{m.pihakAtauRekeningLawan}</div>
                              <div className="text-[10px] text-zinc-600">{m.uraian}</div>
                              {m.detailItems && m.detailItems.length > 0 && (
                                <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-sky-200">
                                  {m.detailItems.map((it, idx) => (
                                    <div key={idx} className="text-[10px] text-zinc-600">
                                      • {it.nama} ({it.qty} {it.satuan} &times; {formatRupiah(it.harga)}) ={' '}
                                      <strong>{formatRupiah(it.subtotal)}</strong>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                              {m.nominalMasuk > 0 ? `+${formatRupiah(m.nominalMasuk)}` : '-'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-amber-800 whitespace-nowrap">
                              {m.nominalKeluar > 0 ? `-${formatRupiah(m.nominalKeluar)}` : '-'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-black text-sky-950 whitespace-nowrap">
                              {formatRupiah(m.saldoSetelah)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Modal Bottom Footer */}
        <div className="p-3 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between text-xs">
          <span className="text-zinc-500 text-[11px]">
            ERP Wijaya Agro · Detail Mutasi SDM &amp; Penggajian
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-semibold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Settle Modal Sub-window */}
      {showSettleModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden animate-in fade-in">
            <div className="p-4 bg-amber-600 text-white font-bold text-sm flex justify-between items-center">
              <span>Cairkan {pendingLogs.length} Hari Kerja &amp; Potong Bon</span>
              <button
                onClick={() => setShowSettleModal(false)}
                className="text-amber-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProcessSettlement} className="p-5 space-y-3.5 text-xs">
              {settleError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg">
                  {settleError}
                </div>
              )}

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1">
                <div className="flex justify-between">
                  <span>Akumulasi Upah {pendingLogs.length} Hari:</span>
                  <strong className="font-mono text-emerald-800">
                    {formatRupiah(karyawan.totalUpahBelumDibayar)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Total Bon Karyawan:</span>
                  <strong className="font-mono text-rose-800">
                    {formatRupiah(karyawan.totalBonKaryawan)}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Beban Divisi Pembayar
                </label>
                <select
                  value={settleDivisi}
                  onChange={(e) => setSettleDivisi(e.target.value as NamaDivisi)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold"
                >
                  <option value="Gudang Wijaya Agro">Gudang Wijaya Agro</option>
                  <option value="Wijaya Karya">Wijaya Karya</option>
                  <option value="Wijaya Transport">Wijaya Transport</option>
                  <option value="CV Wijaya Agro">CV Wijaya Agro</option>
                  <option value="PT Wijaya Agro Perkasa">PT Wijaya Agro Perkasa</option>
                  <option value="Okussa">Okussa</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Rekening Kas / Bank Pencairan
                </label>
                <select
                  value={settleRekening}
                  onChange={(e) => setSettleRekening(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold"
                >
                  {validRekeningList.map((r) => (
                    <option key={r.kode} value={r.kode}>
                      {r.nama} ({r.kode}) - Saldo: {formatRupiah(r.saldoSaatIni)}
                    </option>
                  ))}
                  <option value="SINKRON">SINKRON — Non-Kas (Rp 0 Uang Riil)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-zinc-700">
                    Tanggal Pencairan (Uang Keluar di Arus Kas Harian)
                  </label>
                  <button
                    type="button"
                    onClick={() => setSettleTanggalBayar(`${new Date().getFullYear()}-11-01`)}
                    className="text-[11px] text-emerald-700 hover:underline font-bold cursor-pointer"
                  >
                    Set Tgl 1 Nov
                  </button>
                </div>
                <input
                  type="date"
                  value={settleTanggalBayar}
                  onChange={(e) => setSettleTanggalBayar(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Pilihan Pemotongan Bon Karyawan
                </label>
                <select
                  value={settlePersenBon}
                  onChange={(e) => setSettlePersenBon(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold"
                  disabled={karyawan.totalBonKaryawan <= 0}
                >
                  <option value={100}>Potong 100% (Lunaskan Bon Sebanyak Upah)</option>
                  <option value={50}>Potong 50% dari Bon</option>
                  <option value={25}>Potong 25% dari Bon</option>
                  <option value={0}>0% (Tanpa Potongan Bon)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={settleSubmitting}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {settleSubmitting ? 'Memproses...' : 'Proses Pencairan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Universal Edit Detail Upah Harian / Slip Gaji */}
      <ModalEditTransaksiUniversal
        isOpen={Boolean(editTarget)}
        transactionId={editTarget?.id || null}
        jenisHint={editTarget?.jenis}
        onClose={() => setEditTarget(null)}
        onSuccess={() => {
          loadDetail();
          onRefreshAll();
        }}
      />

      {showProfilModal && (
        <ModalProfilKaryawan
          karyawan={{
            id: karyawan.id,
            nik: karyawan.nik,
            nama: karyawan.nama,
            jabatan: karyawan.jabatan,
            divisi: karyawan.divisi || karyawan.departemen || karyawan.divisiTerakhir,
            telepon: karyawan.telepon,
            status: karyawan.status,
            fotoUrl: karyawan.fotoUrl,
            riwayatDivisi: karyawan.riwayatDivisi,
          }}
          onClose={() => setShowProfilModal(false)}
          onSaved={() => {
            setShowProfilModal(false);
            loadDetail();
            onRefreshAll();
          }}
        />
      )}

      {showPhotoZoom && karyawan.fotoUrl && (
        <ModalPreviewFotoKaryawan
          nama={karyawan.nama}
          jabatan={karyawan.jabatan}
          divisi={karyawan.divisi || karyawan.departemen || karyawan.divisiTerakhir}
          fotoUrl={karyawan.fotoUrl}
          onClose={() => setShowPhotoZoom(false)}
        />
      )}
    </div>
  );
};
