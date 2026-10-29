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
import { Mitra, ProfilPerusahaan, Rekening, RekeningKoranMitraSummary } from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat, formatTanggalIndo } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { CetakRekeningKoranModal } from './CetakRekeningKoranModal.tsx';
import { FotoNotaPreviewModal } from '../common/FotoNotaPreviewModal.tsx';
import { ModalPinjamUangMitra } from '../common/ModalPinjamUangMitra.tsx';
import { ShareLinkModal } from '../public/ShareLinkModal.tsx';
import { ModalBersihkanNotaLalu } from '../common/ModalBersihkanNotaLalu.tsx';
import { ModalTransaksiAnakPerusahaan } from '../common/ModalTransaksiAnakPerusahaan.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';

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
  const [shareModalOpen, setShareModalOpen] = useState<boolean>(false);
  const [quickCopied, setQuickCopied] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'TABEL' | 'LEMBAR_CETAK'>('TABEL');
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
    return {
      namaPerusahaan: src?.namaPerusahaan?.trim() || 'PT. WIJAYA AGRO PERKASA',
      badanHukum: src?.badanHukum?.trim() || 'PT (Perseroan Terbatas)',
      alamat: src?.alamat?.trim() || '-',
      telepon: src?.telepon?.trim() || '-',
      email: src?.email?.trim() || '-',
      penanggungJawab: src?.penanggungJawab?.trim() || 'Bagian Keuangan & Manajemen',
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
                {m.nama} ({m.kode}) - {m.role} - {m.telepon}
              </option>
            ))}
          </select>
        </div>

        {statement && (
          <div className="text-xs text-zinc-600 sm:text-right space-y-0.5">
            <div>
              Status: <strong className="text-emerald-700 font-bold">{statement.status}</strong> ({statement.role})
            </div>
            <div>
              Alamat: <span className="text-zinc-800 font-medium">{statement.alamat || '-'}</span>
            </div>
            <div>
              Kontak HP/WA: <span className="font-mono text-zinc-800">{statement.telepon || '-'}</span>
            </div>
          </div>
        )}
      </div>

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
          {/* Summary Balance Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Kasbon Barang */}
            <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs min-w-0 overflow-hidden">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block truncate">
                Kasbon Barang (Toko)
              </span>
              <div
                className="text-lg font-bold text-zinc-900 mt-1 font-mono tabular-nums truncate whitespace-nowrap"
                title={formatRupiah(statement.totalKasbonBarang)}
              >
                {formatRupiahSingkat(statement.totalKasbonBarang)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 truncate">Pupuk &amp; obat saprotan belum lunas</div>
            </div>

            {/* Total Kasbon Uang */}
            <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs min-w-0 overflow-hidden">
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block truncate">
                Kasbon Uang Tunai
              </span>
              <div
                className="text-lg font-bold text-rose-700 mt-1 font-mono tabular-nums truncate whitespace-nowrap"
                title={formatRupiah(statement.totalKasbonUang)}
              >
                {formatRupiahSingkat(statement.totalKasbonUang)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 truncate">Pinjaman kas operasional aktif</div>
            </div>

            {/* SISA BON BERSIH MITRA */}
            <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 shadow-2xs min-w-0 overflow-hidden">
              <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block truncate">
                SISA BON BERSIH MITRA
              </span>
              <div
                className="text-xl font-black text-amber-900 mt-1 font-mono tabular-nums truncate whitespace-nowrap"
                title={formatRupiah(
                  statement.sisaBonBersih ??
                    Math.max(0, statement.totalBonKeseluruhan - statement.totalTitip)
                )}
              >
                {formatRupiahSingkat(
                  statement.sisaBonBersih ??
                    Math.max(0, statement.totalBonKeseluruhan - statement.totalTitip)
                )}
              </div>
              <div className="text-[11px] text-amber-800 font-medium mt-1 truncate">
                {(statement.potonganTitipanOtomatis ??
                  Math.min(statement.totalBonKeseluruhan, statement.totalTitip)) > 0
                  ? `Bon awal ${formatRupiahSingkat(statement.totalBonKeseluruhan)} sudah potong titipan`
                  : 'Total piutang yang wajib dibayar mitra'}
              </div>
            </div>

            {/* SISA WAJIB BAYAR PT KE MITRA (TITIPAN BERSIH) */}
            <div className="bg-purple-50/70 p-4 rounded-xl border border-purple-200 shadow-2xs min-w-0 overflow-hidden">
              <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider block truncate">
                SISA BAYAR PT KE MITRA
              </span>
              <div
                className="text-xl font-black text-purple-950 mt-1 font-mono tabular-nums truncate whitespace-nowrap"
                title={formatRupiah(
                  statement.sisaTitipanBersih ??
                    Math.max(0, statement.totalTitip - statement.totalBonKeseluruhan)
                )}
              >
                {formatRupiahSingkat(
                  statement.sisaTitipanBersih ??
                    Math.max(0, statement.totalTitip - statement.totalBonKeseluruhan)
                )}
              </div>
              <div className="text-[11px] text-purple-800 font-medium mt-1 truncate">
                {(statement.potonganTitipanOtomatis ??
                  Math.min(statement.totalBonKeseluruhan, statement.totalTitip)) > 0
                  ? `Hak awal ${formatRupiahSingkat(statement.totalTitip)} - Bon ${formatRupiahSingkat(
                      statement.potonganTitipanOtomatis ??
                        Math.min(statement.totalBonKeseluruhan, statement.totalTitip)
                    )}`
                  : statement.isKaryawan
                  ? 'Gabungan titip panen + upah kerja belum cair'
                  : 'Hasil bumi titipan belum diambil uangnya'}
              </div>
            </div>
          </div>

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

          {/* VIEW MODE 1: MODERN RESPONSIVE TABLE VIEW */}
          {viewMode === 'TABEL' && (
            <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-zinc-900">
                    Buku Besar Mutasi: {statement.namaMitra} ({statement.kodeMitra})
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Daftar kronologis lengkap dengan kuantitas (Qty), harga satuan, dan rincian per barang
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 font-medium">
                    {statement.history.length} Catatan Transaksi
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-3 w-24">TANGGAL &amp; JAM</th>
                      <th className="py-3 px-3 w-28">NO. BUKTI</th>
                      <th className="py-3 px-3 w-28">JENIS</th>
                      <th className="py-3 px-3">KETERANGAN &amp; RINCIAN</th>
                      <th className="py-3 px-3 text-center w-20">QTY</th>
                      <th className="py-3 px-3 text-right w-24">HARGA SATUAN</th>
                      <th className="py-3 px-3 text-right w-24">MUTASI BON (+)</th>
                      <th className="py-3 px-3 text-right w-24">BAYAR BON (-)</th>
                      <th className="py-3 px-3 text-right font-bold w-28">SALDO BON</th>
                      <th className="py-3 px-3 text-center w-20">AKSI NEGO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-zinc-800">
                    {statement.history.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-zinc-400">
                          Belum ada histori transaksi untuk mitra ini
                        </td>
                      </tr>
                    ) : (
                      statement.history.map((row) => {
                        const isExpanded = expandedRowId === row.id;
                        const hasItems = row.itemsDetail && row.itemsDetail.length > 0;

                        return (
                          <React.Fragment key={row.id}>
                            <tr className="hover:bg-zinc-50/80 transition-colors">
                              <td className="py-3 px-3 text-zinc-500 whitespace-nowrap text-[11px]">
                                <div>{row.tanggal}</div>
                                <div className="text-[10px] text-zinc-400">{row.jam}</div>
                              </td>
                              <td className="py-3 px-3 font-mono font-bold text-zinc-900 whitespace-nowrap text-[11px]">
                                {row.id}
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                <span
                                  className={`text-[10px] font-semibold ${
                                    row.jenis === 'PENJUALAN_KASBON'
                                      ? 'text-amber-800'
                                      : row.jenis === 'KASBON_UANG'
                                      ? 'text-rose-800'
                                      : row.jenis === 'BAYAR_BON'
                                      ? 'text-emerald-800'
                                      : row.jenis === 'PEMBELIAN_TITIP'
                                      ? 'text-purple-800 font-bold'
                                      : row.jenis.includes('UPAH KERJA (BELUM CAIR)')
                                      ? 'text-amber-700 font-bold'
                                      : row.jenis.includes('PEMBAYARAN GAJI')
                                      ? 'text-emerald-700 font-bold'
                                      : row.jenis.includes('UPAH KERJA')
                                      ? 'text-slate-600'
                                      : row.jenis.includes('ANAK_PERUSAHAAN')
                                      ? 'text-teal-800 font-bold'
                                      : 'text-zinc-700'
                                  }`}
                                >
                                  {row.jenis.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-1 flex-wrap">
                                    <div className="flex items-center space-x-1.5 flex-wrap">
                                      {row.isNotaLalu && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                                          NOTA LALU {row.noNotaLalu ? `(${row.noNotaLalu})` : ''}
                                        </span>
                                      )}
                                      <span className="font-medium text-zinc-900">{row.keterangan || '-'}</span>
                                      {row.nominalMutasiHak && row.nominalMutasiHak > 0 ? (
                                        <span className="font-mono tabular-nums font-bold text-[11px] text-purple-800">
                                          · Nilai: {formatRupiah(row.nominalMutasiHak)}
                                        </span>
                                      ) : null}
                                    </div>

                                    <div className="flex items-center space-x-1.5 shrink-0">
                                      {row.fotoNota && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPreviewPhoto({
                                              imageUrl: row.fotoNota!,
                                              title: `Foto Fisik Nota Manual - ${row.id}`,
                                              nomorBukti: row.id,
                                              namaMitra: statement?.namaMitra,
                                              tanggal: row.tanggal,
                                              nominalText:
                                                row.debet > 0
                                                  ? `+${formatRupiah(row.debet)}`
                                                  : row.kredit > 0
                                                  ? `-${formatRupiah(row.kredit)}`
                                                  : formatRupiah(row.nominalMutasiHak || 0),
                                              keterangan: row.keterangan,
                                            })
                                          }
                                          className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-semibold text-[10px] flex items-center space-x-1 transition-colors cursor-pointer"
                                          title="Lihat Foto Fisik Nota Manual"
                                        >
                                          <Camera className="w-3 h-3 text-amber-700" />
                                          <span>Foto Nota</span>
                                        </button>
                                      )}

                                      {hasItems && row.itemsDetail!.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                                          className="text-[10px] text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer font-medium ml-1"
                                        >
                                          <span>{row.itemsDetail!.length} item</span>
                                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Quantity Column */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <span className="inline-block px-2 py-0.5 bg-zinc-100 rounded text-zinc-800 font-bold text-[11px]">
                                  {row.qtyDisplay || (row.jenis === 'KASBON_UANG' ? '1' : '-')}
                                </span>
                              </td>

                              {/* Harga Satuan Column */}
                              <td className="py-3 px-3 text-right font-mono text-zinc-700 whitespace-nowrap text-[11px]">
                                {row.hargaSatuanDisplay || (row.jenis === 'KASBON_UANG' ? formatRupiah(row.debet) : '-')}
                              </td>

                              {/* Mutasi Bon (+) */}
                              <td className="py-3 px-3 text-right font-mono text-rose-700 whitespace-nowrap font-medium text-[11px]">
                                {row.debet > 0 ? `+${formatRupiah(row.debet)}` : '-'}
                              </td>

                              {/* Bayar Bon (-) */}
                              <td className="py-3 px-3 text-right font-mono text-emerald-700 whitespace-nowrap font-medium text-[11px]">
                                {row.kredit > 0
                                  ? `-${formatRupiah(row.kredit)}`
                                  : row.nominalMutasiHak && row.nominalMutasiHak > 0
                                  ? (
                                    <span
                                      className={
                                        row.kategoriMutasiHak === 'SLIP_GAJI' || row.kategoriMutasiHak === 'TITIP_CAIR'
                                          ? 'text-emerald-700'
                                          : 'text-purple-700'
                                      }
                                    >
                                      {row.kategoriMutasiHak === 'SLIP_GAJI'
                                        ? `Cair ${formatRupiah(row.nominalMutasiHak)}`
                                        : row.kategoriMutasiHak === 'UPAH_TERCATAT'
                                        ? `+Upah ${formatRupiah(row.nominalMutasiHak)}`
                                        : row.kategoriMutasiHak === 'UPAH_SUDAH_CAIR'
                                        ? `Upah ${formatRupiah(row.nominalMutasiHak)}`
                                        : row.kategoriMutasiHak === 'TITIP_MASUK'
                                        ? `+Titip ${formatRupiah(row.nominalMutasiHak)}`
                                        : formatRupiah(row.nominalMutasiHak)}
                                    </span>
                                  )
                                  : '-'}
                              </td>

                              {/* Saldo Bon Mitra */}
                              <td className="py-3 px-3 text-right font-mono font-bold text-zinc-900 whitespace-nowrap text-[11px]">
                                {formatRupiah(row.saldoAkumulasi)}
                              </td>

                              {/* Aksi Edit Detail / Nego Transaksi */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setUniversalEditId(row.id)}
                                  className="inline-flex items-center space-x-1 px-2.5 py-1 text-[10px] font-bold text-zinc-800 hover:text-white bg-zinc-100 hover:bg-zinc-900 rounded border border-zinc-300 hover:border-zinc-900 transition-colors cursor-pointer shadow-2xs"
                                  title="Edit detail nominal, tonase, qty, harga satuan, rekening, atau tanggal transaksi"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Edit Detail</span>
                                </button>
                              </td>
                            </tr>

                            {/* Sub-item breakdown row if expanded */}
                            {isExpanded && hasItems && (
                              <tr className="bg-amber-50/40">
                                <td colSpan={10} className="py-2.5 px-6">
                                  <div className="bg-white rounded-lg border border-amber-200 p-3 space-y-1.5 shadow-2xs">
                                    <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                                      Rincian Item Pembelian Kasbon:
                                    </span>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                      {row.itemsDetail!.map((it, idx) => (
                                        <div
                                          key={idx}
                                          className="p-2 bg-zinc-50 rounded border border-zinc-200 text-[11px] flex justify-between items-center"
                                        >
                                          <div>
                                            <div className="font-semibold text-zinc-800">{it.nama}</div>
                                            <div className="text-[10px] text-zinc-500">
                                              {it.qty} {it.satuan} &times; {formatRupiah(it.harga)}
                                            </div>
                                          </div>
                                          <div className="font-mono font-bold text-zinc-900">
                                            {formatRupiah(it.subtotal)}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                  {statement.history.length > 0 && (
                    <tfoot className="bg-zinc-50 font-bold border-t-2 border-zinc-300">
                      <tr>
                        <td colSpan={6} className="py-3 px-4 text-right uppercase text-[11px] text-zinc-700">
                          Total Sisa Kewajiban Bon Mitra:
                        </td>
                        <td colSpan={3} className="py-3 px-4 text-right font-mono text-base text-amber-900">
                          {formatRupiah(statement.totalBonKeseluruhan)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: AUTHENTIC PRINT PAPER A4 LAYOUT (PERSIS DOKUMEN CETAK & BACKUP HARIAN) */}
          {viewMode === 'LEMBAR_CETAK' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-xs text-indigo-900">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-indigo-700 shrink-0" />
                  <span>
                    <strong>Mode Lembar Cetak A4 Aktif:</strong> Format tata letak dokumen fisik dengan kop resmi, biodata mitra, tabel mutasi rincian Qty/Harga, dan kolom tanda tangan siap cetak.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handlePrintClick}
                  className="bg-indigo-700 hover:bg-indigo-800 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-2xs shrink-0 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Buka Dialog Cetak / PDF</span>
                </button>
              </div>

              {/* Physical Document Paper Simulation */}
              <div className="bg-white rounded-xl shadow-md border border-zinc-300 p-6 sm:p-10 space-y-6 max-w-4xl mx-auto text-zinc-900 print:shadow-none print:border-none print:p-0">
                {/* 1. KOP SURAT RESMI (DINAMIS DARI MENU PROFIL PERUSAHAAN) */}
                <div className="border-b-2 border-zinc-900 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-7 h-7 text-emerald-800 shrink-0" />
                      <span className="text-2xl font-black text-zinc-900 tracking-tight">
                        {activeProfil.namaPerusahaan}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-zinc-700">
                      {activeProfil.badanHukum}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {activeProfil.alamat} · Telp: {activeProfil.telepon}
                      {activeProfil.email && activeProfil.email !== '-' ? ` · Email: ${activeProfil.email}` : ''}
                    </p>
                    {activeRekeningUtama && (
                      <p className="text-[11px] text-zinc-600 font-medium pt-0.5">
                        Rekening Utama: <span className="font-mono font-semibold">{activeRekeningUtama.nama}</span>
                        {activeRekeningUtama.nomorRekening ? ` (${activeRekeningUtama.nomorRekening})` : ` (${activeRekeningUtama.kode})`}
                        {activeRekeningUtama.atasNama ? ` a.n. ${activeRekeningUtama.atasNama}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-200">
                    <span className="text-xs font-black uppercase tracking-wider text-indigo-950 bg-indigo-50 px-3 py-1 rounded border border-indigo-300">
                      REKENING KORAN MITRA
                    </span>
                    <p className="text-[11px] text-zinc-500 font-mono mt-1.5">
                      No. Dokumen: RK/{statement.kodeMitra}/{now.getFullYear()}{String(now.getMonth() + 1).padStart(2, '0')}{String(now.getDate()).padStart(2, '0')}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Dicetak: {tglCetak} · {jamCetak} WIB
                    </p>
                  </div>
                </div>

                {/* 2. IDENTITAS MITRA BOX */}
                <div className="bg-zinc-50 rounded-lg border border-zinc-300 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      DATA MITRA / PETANI
                    </span>
                    <div className="text-sm font-bold text-zinc-900">
                      {statement.namaMitra}{' '}
                      <span className="font-mono text-xs font-normal text-zinc-600">
                        ({statement.kodeMitra})
                      </span>
                    </div>
                    <div className="text-zinc-600">
                      Peran: <strong className="text-zinc-800">{statement.role}</strong> · Status: <strong className="text-emerald-700">{statement.status}</strong>
                    </div>
                  </div>

                  <div className="space-y-1 sm:text-right">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      KONTAK &amp; LOKASI
                    </span>
                    <div className="font-medium text-zinc-800">
                      HP / WA: <span className="font-mono font-bold">{statement.telepon || '-'}</span>
                    </div>
                    <div className="text-zinc-600">
                      Alamat: {statement.alamat || '-'}
                    </div>
                  </div>
                </div>

                {/* 3. RINGKASAN SALDO 4 BOX */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Kasbon Barang</span>
                    <p className="text-sm font-bold text-zinc-900 mt-0.5">
                      {formatRupiah(statement.totalKasbonBarang)}
                    </p>
                    <span className="text-[9px] text-zinc-400">Pupuk / benih / obat</span>
                  </div>

                  <div className="p-3 bg-rose-50/60 rounded-lg border border-rose-200">
                    <span className="text-[10px] font-bold text-rose-700 uppercase">Kasbon Uang</span>
                    <p className="text-sm font-bold text-rose-800 mt-0.5">
                      {formatRupiah(statement.totalKasbonUang)}
                    </p>
                    <span className="text-[9px] text-rose-500">Pinjaman tunai aktif</span>
                  </div>

                  <div className="p-3 bg-amber-50 rounded-lg border-2 border-amber-400 shadow-2xs">
                    <span className="text-[10px] font-black text-amber-900 uppercase">TOTAL SISA BON</span>
                    <p className="text-base font-black text-amber-950 mt-0.5 font-mono">
                      {formatRupiah(statement.totalBonKeseluruhan)}
                    </p>
                    <span className="text-[9px] font-semibold text-amber-800">Wajib dibayar mitra</span>
                  </div>

                  <div className="p-3 bg-purple-50/60 rounded-lg border border-purple-200">
                    <span className="text-[10px] font-bold text-purple-900 uppercase">Titip Hasil Bumi</span>
                    <p className="text-sm font-bold text-purple-950 mt-0.5 font-mono tabular-nums">
                      {formatRupiah(statement.totalTitip)}
                    </p>
                    <span className="text-[9px] text-purple-600">Hasil panen tersimpan</span>
                  </div>
                </div>

                {(statement.isAnakPerusahaan || statement.role === 'ANAK_PERUSAHAAN') && (
                  <div className="p-3.5 bg-teal-50/70 rounded-lg border border-teal-300 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-teal-900 uppercase block">
                        Saldo Rekening {statement.kodeRekeningTerkait || 'REK-DPPARABO'}
                      </span>
                      <span className="text-sm font-black font-mono text-teal-950 tabular-nums">
                        {formatRupiah(statement.saldoRekeningAnakPerusahaan || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-zinc-600 uppercase block">
                        Mutasi Masuk / Keluar Rekening
                      </span>
                      <span className="text-xs font-mono font-bold text-zinc-800 tabular-nums">
                        +{formatRupiah(statement.totalSimpanKeAnakPerusahaan || 0)} / -{formatRupiah(statement.totalPakaiDariAnakPerusahaan || 0)}
                      </span>
                    </div>
                    <div className="sm:text-right">
                      <span className="text-[10px] font-bold text-teal-900 uppercase block">
                        Posisi Bersih Terpadu
                      </span>
                      <span className="text-sm font-black font-mono text-teal-950 tabular-nums">
                        {formatRupiah(statement.posisiBersihTerpadu || 0)}
                      </span>
                    </div>
                  </div>
                )}

                {/* 4. TABEL BUKU BESAR MUTASI RINCIAN */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
                    <span>RINCIAN MUTASI TRANSAKSI BUKU BESAR</span>
                    <span className="text-[10px] text-zinc-400 font-mono">Mata Uang: IDR</span>
                  </div>

                  <div className="border border-zinc-300 rounded-lg overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-zinc-100 text-zinc-800 font-bold uppercase text-[9px] border-b border-zinc-300">
                        <tr>
                          <th className="py-2.5 px-2.5 w-20">TGL &amp; JAM</th>
                          <th className="py-2.5 px-2.5 w-24">NO. BUKTI</th>
                          <th className="py-2.5 px-2.5 w-24">JENIS</th>
                          <th className="py-2.5 px-2.5">URAIAN / KETERANGAN BARANG</th>
                          <th className="py-2.5 px-2 text-center w-16">QTY</th>
                          <th className="py-2.5 px-2 text-right w-24">HRG SATUAN</th>
                          <th className="py-2.5 px-2 text-right w-22 whitespace-nowrap">KASBON (+)</th>
                          <th className="py-2.5 px-2 text-right w-22 whitespace-nowrap">BAYAR (-)</th>
                          <th className="py-2.5 px-2.5 text-right w-26 whitespace-nowrap">SALDO BON</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 text-zinc-900 text-[11px]">
                        {statement.history.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-8 text-center text-zinc-400">
                              Belum ada transaksi pada rekening koran ini
                            </td>
                          </tr>
                        ) : (
                          statement.history.map((row) => (
                            <tr key={row.id} className="hover:bg-zinc-50/50">
                              <td className="py-2 px-2.5 text-zinc-500 text-[10px] whitespace-nowrap">
                                <div>{row.tanggal}</div>
                                <div className="text-[9px] text-zinc-400">{row.jam}</div>
                              </td>
                              <td className="py-2 px-2.5 font-mono font-medium text-zinc-900 text-[10px] whitespace-nowrap">
                                {row.id}
                              </td>
                              <td className="py-2 px-2.5 font-semibold text-[10px] whitespace-nowrap">
                                {row.jenis.replace(/_/g, ' ')}
                              </td>
                              <td className="py-2 px-2.5 text-zinc-700 text-[10px]">
                                <div>{row.keterangan || '-'}</div>
                                {row.itemsDetail && row.itemsDetail.length > 1 && (
                                  <div className="mt-1 space-y-0.5 text-[9px] text-zinc-500 bg-zinc-50 p-1 rounded border border-zinc-200">
                                    {row.itemsDetail.map((it, idx) => (
                                      <div key={idx} className="flex justify-between">
                                        <span>• {it.nama}</span>
                                        <span className="font-mono">{it.qty} {it.satuan} @ {formatRupiah(it.harga)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center font-bold text-zinc-800 text-[10px] whitespace-nowrap">
                                {row.qtyDisplay || (row.jenis === 'KASBON_UANG' ? '1' : '-')}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-zinc-700 text-[10px] whitespace-nowrap">
                                {row.hargaSatuanDisplay || (row.jenis === 'KASBON_UANG' ? formatRupiah(row.debet) : '-')}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-rose-700 whitespace-nowrap text-[10px]">
                                {row.debet > 0 ? `+${formatRupiah(row.debet)}` : '-'}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-emerald-700 whitespace-nowrap text-[10px]">
                                {row.kredit > 0
                                  ? `-${formatRupiah(row.kredit)}`
                                  : row.nominalMutasiHak && row.nominalMutasiHak > 0
                                  ? formatRupiah(row.nominalMutasiHak)
                                  : '-'}
                              </td>
                              <td className="py-2 px-2.5 text-right font-mono font-bold text-zinc-900 whitespace-nowrap text-[10px]">
                                {formatRupiah(row.saldoAkumulasi)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {statement.history.length > 0 && (
                        <tfoot className="bg-zinc-100 font-bold border-t-2 border-zinc-300">
                          <tr>
                            <td colSpan={6} className="py-2.5 px-3 text-right uppercase text-[10px]">
                              Total Sisa Saldo Bon:
                            </td>
                            <td colSpan={3} className="py-2.5 px-3 text-right font-mono text-amber-900 text-sm">
                              {formatRupiah(statement.totalBonKeseluruhan)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* 5. KOLOM TANDA TANGAN RESMI PENGESAHAN DOKUMEN */}
                <div className="pt-6 border-t border-zinc-200 grid grid-cols-2 gap-8 text-xs text-center text-zinc-600">
                  <div className="space-y-16">
                    <div>
                      <p className="font-semibold text-zinc-800">Penanggung Jawab / Keuangan,</p>
                      <p className="text-[10px] text-zinc-500">{activeProfil.namaPerusahaan}</p>
                    </div>
                    <div>
                      <div className="w-44 border-b border-zinc-400 mx-auto" />
                      <p className="text-[11px] font-bold text-zinc-800 mt-1">( {activeProfil.penanggungJawab} )</p>
                    </div>
                  </div>

                  <div className="space-y-16">
                    <div>
                      <p className="font-semibold text-zinc-800">Mitra / Petani Penerima,</p>
                      <p className="text-[10px] text-zinc-500">Konfirmasi Saldo &amp; Bon</p>
                    </div>
                    <div>
                      <div className="w-44 border-b border-zinc-400 mx-auto" />
                      <p className="text-[11px] font-bold text-zinc-800 mt-1">( {statement.namaMitra} )</p>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-center text-zinc-500 pt-2 space-y-0.5">
                  {activeProfil.catatanHeaderNota && (
                    <p className="italic font-medium text-zinc-600">&ldquo;{activeProfil.catatanHeaderNota}&rdquo;</p>
                  )}
                  <p className="text-zinc-400 italic">
                    Dokumen rekening koran ini sah diterbitkan oleh Sistem ERP {activeProfil.namaPerusahaan} sebagai bukti mutasi buku besar mitra.
                  </p>
                </div>

                {/* Lampiran Bukti Fisik Nota Lalu */}
                {statement.history.some((h) => !!h.fotoNota) && (
                  <div className="pt-6 border-t-2 border-dashed border-zinc-300 space-y-4 print-page-break print:break-before-page">
                    <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                      <div className="flex items-center space-x-2">
                        <Camera className="w-4 h-4 text-amber-600" />
                        <h4 className="text-xs font-bold text-zinc-900 uppercase">
                          Lampiran Fisik Bukti Nota Lalu Terkait
                        </h4>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Dokumen Asli Tersimpan di Database
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {statement.history
                        .filter((h) => !!h.fotoNota)
                        .flatMap((h) => {
                          const imgs = (h.fotoNota || '').split('|||').map((s) => s.trim()).filter(Boolean);
                          return imgs.map((img, idx) => ({
                            txId: h.id,
                            noNotaLalu: h.noNotaLalu,
                            tanggal: h.tanggal,
                            jenis: h.jenis,
                            keterangan: h.keterangan,
                            nominal: h.debet > 0 ? h.debet : h.kredit > 0 ? h.kredit : (h.itemsDetail?.[0]?.subtotal || 0),
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
                              <div className="text-[9px] text-zinc-500 italic line-clamp-2">
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
    </div>
  );
};
