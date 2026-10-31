import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Info,
  History,
  ArrowRight,
  Pencil,
  HandCoins,
  Wheat,
  RefreshCw,
  Lock,
} from 'lucide-react';
import {
  Mitra,
  RekapMitraItem,
  Rekening,
  RekeningKoranMitraSummary,
  TransaksiBayarBon,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';

interface Props {
  mitraList: Mitra[];
  rekeningList: Rekening[];
  bayarBonList: TransaksiBayarBon[];
  initialSelectedMitraId?: string;
  onNavigateToBayarTitipan?: (idMitra: string) => void;
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
}

export const BayarBonView: React.FC<Props> = ({
  mitraList,
  rekeningList,
  bayarBonList,
  initialSelectedMitraId,
  onNavigateToBayarTitipan,
  onSuccess,
  onRefresh,
}) => {
  const activeMitras = useMemo(
    () => mitraList.filter((m) => m.status === 'AKTIF'),
    [mitraList]
  );
  const availableBanks = useMemo(
    () => rekeningList.filter((r) => !r.isVirtual && r.kode !== 'KAS01' && r.status === 'AKTIF'),
    [rekeningList]
  );
  const kas01 = rekeningList.find((r) => r.kode === 'KAS01');
  const sinkronRek = rekeningList.find((r) => r.kode === 'SINKRON');

  const [rekapItems, setRekapItems] = useState<RekapMitraItem[]>([]);
  const [selectedMitraId, setSelectedMitraId] = useState<string>(
    initialSelectedMitraId || activeMitras[0]?.id || ''
  );
  const [hasAutoPickedInitial, setHasAutoPickedInitial] = useState<boolean>(
    Boolean(initialSelectedMitraId)
  );
  const [statementData, setStatementData] = useState<RekeningKoranMitraSummary | null>(null);
  const [loadingStatement, setLoadingStatement] = useState<boolean>(false);

  const [metode, setMetode] = useState<'SINKRON' | 'TUNAI' | 'TRANSFER'>('TUNAI');
  const [rekeningTujuan, setRekeningTujuan] = useState<string>(availableBanks[0]?.kode || 'BNI01');
  const [nominalBayarInput, setNominalBayarInput] = useState<string>('');
  const [keterangan, setKeterangan] = useState<string>('Pembayaran pelunasan bon mitra');

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [editTxId, setEditTxId] = useState<string | null>(null);

  // Sync external navigation target if provided
  useEffect(() => {
    if (initialSelectedMitraId) {
      setSelectedMitraId(initialSelectedMitraId);
      setHasAutoPickedInitial(true);
    }
  }, [initialSelectedMitraId]);

  const loadRekapMitra = async () => {
    try {
      const res = await api.getRekapMitra();
      const items = res.items || [];
      setRekapItems(items);
      if (!hasAutoPickedInitial && items.length > 0) {
        // Prioritaskan mitra aktif yang memiliki bon (baik yang siap SINKRON maupun bayar tunai/transfer)
        const firstReadySinkron = items.find(
          (it) => it.status === 'AKTIF' && it.totalBonMitra > 0 && it.totalHutangTitipPanen > 0
        );
        const firstWithAnyBon = items.find(
          (it) => it.status === 'AKTIF' && it.totalBonMitra > 0
        );
        const picked = firstReadySinkron || firstWithAnyBon;
        if (picked) {
          setSelectedMitraId(picked.id);
        }
        setHasAutoPickedInitial(true);
      }
    } catch {
      // ignore fallback
    }
  };

  useEffect(() => {
    loadRekapMitra();
  }, [bayarBonList.length, mitraList.length]);

  const rekapMap = useMemo(() => {
    const m = new Map<string, RekapMitraItem>();
    for (const item of rekapItems) {
      m.set(item.id, item);
    }
    return m;
  }, [rekapItems]);

  // Urutkan mitra: yang memiliki Bon & Titipan (siap SINKRON) atau Bon aktif paling atas
  const sortedMitras = useMemo(() => {
    return [...activeMitras].sort((a, b) => {
      const ra = rekapMap.get(a.id);
      const rb = rekapMap.get(b.id);
      const bonA = ra?.totalBonMitra || 0;
      const bonB = rb?.totalBonMitra || 0;
      const hasBonA = bonA > 0 ? 1 : 0;
      const hasBonB = bonB > 0 ? 1 : 0;
      if (hasBonA !== hasBonB) return hasBonB - hasBonA;

      const sinkronA = bonA > 0 && (ra?.totalHutangTitipPanen || 0) > 0 ? 1 : 0;
      const sinkronB = bonB > 0 && (rb?.totalHutangTitipPanen || 0) > 0 ? 1 : 0;
      if (sinkronA !== sinkronB) return sinkronB - sinkronA;

      if (bonA !== bonB) return bonB - bonA;
      return a.nama.localeCompare(b.nama, 'id');
    });
  }, [activeMitras, rekapMap]);

  const applyDefaultModeForStatement = (data: RekeningKoranMitraSummary) => {
    const bonKotor = data.totalBonKeseluruhan || 0;
    const titipAktif = data.totalTitip || 0;
    const maksSinkron = Math.min(bonKotor, titipAktif);
    const netBonFisik = data.sisaBonBersih ?? Math.max(0, bonKotor - titipAktif);

    if (bonKotor > 0 && titipAktif > 0 && maksSinkron > 0) {
      setMetode('SINKRON');
      setNominalBayarInput(String(maksSinkron));
      setKeterangan(
        'Pelunasan bon via SINKRON (potong langsung dari titipan / uang hasil bumi mitra)'
      );
    } else if (netBonFisik > 0) {
      setMetode((prev) => (prev === 'SINKRON' ? 'TUNAI' : prev));
      setNominalBayarInput(String(netBonFisik));
      setKeterangan('Pembayaran pelunasan bon mitra');
    } else {
      setMetode('TUNAI');
      setNominalBayarInput('0');
      setKeterangan('Pembayaran pelunasan bon mitra');
    }
  };

  const fetchSelectedStatement = async (id: string, silent = false) => {
    if (!id) return;
    if (!silent) setLoadingStatement(true);
    setErrorMsg('');
    try {
      const data = await api.getRekeningKoranMitra(id);
      setStatementData(data);
      applyDefaultModeForStatement(data);
    } catch (err: any) {
      if (!silent) setErrorMsg(err.message || 'Gagal memuat saldo bon mitra');
    } finally {
      setLoadingStatement(false);
    }
  };

  // Fetch statement data when selected Mitra changes
  useEffect(() => {
    if (!selectedMitraId) return;
    fetchSelectedStatement(selectedMitraId, false);
  }, [selectedMitraId]);

  // Auto-refresh statement & rekap silently whenever any transaction/edit/nota-lalu occurs
  useEffect(() => {
    const onErpUpdated = () => {
      loadRekapMitra();
      if (selectedMitraId) {
        fetchSelectedStatement(selectedMitraId, true);
      }
    };
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, [selectedMitraId]);

  const bonKotorAwal = statementData?.totalBonKeseluruhan || 0;
  const saldoTitipHasilBumi = statementData?.totalTitip || 0;
  const maksPotongSinkron = Math.min(bonKotorAwal, saldoTitipHasilBumi);
  const canUseSinkron = bonKotorAwal > 0 && saldoTitipHasilBumi > 0 && maksPotongSinkron > 0;

  // Sisa bon bersih apabila dibayar fisik (Tunai / Transfer)
  const sisaBonFisik =
    statementData?.sisaBonBersih ?? Math.max(0, bonKotorAwal - saldoTitipHasilBumi);
  const sisaBayarPtKeMitra =
    statementData?.sisaTitipanBersih ?? Math.max(0, saldoTitipHasilBumi - bonKotorAwal);

  // Target batas maksimal sesuai metode yang dipilih
  const targetMaksBayar = metode === 'SINKRON' ? maksPotongSinkron : sisaBonFisik;

  const nominalBayar = Number(nominalBayarInput) || 0;
  const isPartial = nominalBayar > 0 && nominalBayar < targetMaksBayar;
  const isFull = nominalBayar > 0 && nominalBayar === targetMaksBayar;
  const isOver = targetMaksBayar > 0 && nominalBayar > targetMaksBayar;

  const sisaBonSetelahTransaksi =
    metode === 'SINKRON'
      ? Math.max(0, bonKotorAwal - nominalBayar)
      : Math.max(0, sisaBonFisik - nominalBayar);

  const sisaTitipanSetelahSinkron =
    metode === 'SINKRON'
      ? Math.max(0, saldoTitipHasilBumi - nominalBayar)
      : Math.max(0, saldoTitipHasilBumi - maksPotongSinkron);

  // Kalkulasi otomatis pengurangan Status Nota Kunci (Nominal Uang Tidak Bisa Kembali)
  const nominalNotaNgunciAwal = statementData?.nominalNotaNgunci || 0;
  const totalAlokasiKeBonSaatIni =
    metode === 'SINKRON' ? nominalBayar : maksPotongSinkron + nominalBayar;
  const estimasiPengurangNotaNgunci =
    nominalBayar > 0 ? Math.min(nominalNotaNgunciAwal, totalAlokasiKeBonSaatIni) : 0;
  const estimasiSisaNotaNgunci = Math.max(0, nominalNotaNgunciAwal - estimasiPengurangNotaNgunci);

  const handleSelectMetode = (nextMetode: 'SINKRON' | 'TUNAI' | 'TRANSFER') => {
    setErrorMsg('');
    setMetode(nextMetode);
    if (nextMetode === 'SINKRON') {
      setNominalBayarInput(maksPotongSinkron > 0 ? String(maksPotongSinkron) : '0');
      setKeterangan(
        'Pelunasan bon via SINKRON (potong langsung dari titipan / uang hasil bumi mitra)'
      );
    } else {
      setNominalBayarInput(sisaBonFisik > 0 ? String(sisaBonFisik) : '0');
      setKeterangan('Pembayaran pelunasan bon mitra');
    }
  };

  const handleProcessSubmit = async () => {
    setErrorMsg('');
    if (bonKotorAwal <= 0) {
      setErrorMsg('Mitra ini sudah tidak memiliki sisa bon aktif (Rp 0).');
      return;
    }
    if (metode === 'SINKRON' && !canUseSinkron) {
      setErrorMsg(
        'Mitra ini tidak memiliki Saldo Titipan / Uang Hasil Bumi untuk dipotong via SINKRON.'
      );
      return;
    }
    if (metode !== 'SINKRON' && sisaBonFisik <= 0) {
      setErrorMsg(
        'Seluruh bon mitra tertutup Saldo Titipan Hasil Bumi — silakan pilih metode SINKRON (tanpa uang keluar).'
      );
      return;
    }
    if (nominalBayar <= 0) {
      setErrorMsg('Nominal pelunasan bon harus lebih dari Rp 0');
      return;
    }
    if (nominalBayar > targetMaksBayar) {
      setErrorMsg(
        `Nominal (${formatRupiah(nominalBayar)}) melebihi batas maksimal ${
          metode === 'SINKRON' ? 'potong SINKRON' : 'sisa bon bersih'
        } (${formatRupiah(targetMaksBayar)})`
      );
      return;
    }

    setSubmitting(true);
    try {
      const result: TransaksiBayarBon = await api.processBayarBon({
        idMitra: selectedMitraId,
        nominalBayar,
        metode,
        rekeningTujuan:
          metode === 'SINKRON'
            ? 'SINKRON'
            : metode === 'TRANSFER'
            ? rekeningTujuan
            : 'KAS01',
        keterangan,
      });

      setShowConfirmModal(false);
      onRefresh();
      loadRekapMitra();

      // Refresh statement data
      const updatedStatement = await api.getRekeningKoranMitra(selectedMitraId);
      setStatementData(updatedStatement);
      applyDefaultModeForStatement(updatedStatement);

      const isResultSinkron =
        result?.metode === 'SINKRON' || result?.rekeningTujuan === 'SINKRON' || metode === 'SINKRON';

      const detailRows: ReceiptData['detailRows'] = [
        { label: 'Nama Mitra', value: result?.namaMitra || 'Mitra' },
        {
          label: 'Metode Pelunasan',
          value: isResultSinkron
            ? 'SINKRON (Potong Titipan / Uang Hasil Bumi)'
            : result?.metode || metode,
        },
        {
          label: 'Rekening Sistem / Tujuan',
          value: isResultSinkron
            ? 'SINKRON (Non-Tunai · Rp 0 Kas Keluar/Masuk)'
            : result?.rekeningTujuan || '-',
        },
      ];

      if (isResultSinkron) {
        detailRows.push({
          label: 'Total Bon Mitra Sebelum Sinkron',
          value: result?.totalBonSebelum ?? bonKotorAwal,
        });
        detailRows.push({
          label: 'Saldo Titipan / Uang Hasil Bumi Awal',
          value: saldoTitipHasilBumi,
        });
        detailRows.push({
          label: 'Nominal Bon Dipotong via SINKRON',
          value: result?.nominalBayar ?? nominalBayar,
          isTotal: true,
        });
        detailRows.push({
          label: 'Sisa Bon Mitra Setelah Sinkron',
          value: result?.sisaBonSetelah ?? 0,
          highlight: (result?.sisaBonSetelah ?? 0) > 0,
        });
        detailRows.push({
          label: 'Sisa Uang Titipan Mitra (Siap Dibayar PT)',
          value: Math.max(0, saldoTitipHasilBumi - (result?.nominalBayar ?? nominalBayar)),
        });
      } else {
        if ((result?.nominalPotongTitipanOtomatis || 0) > 0) {
          detailRows.push({
            label: 'Total Bon Awal (Kotor)',
            value: result.totalBonAwalKotor ?? bonKotorAwal,
          });
          detailRows.push({
            label: 'Dipotong Otomatis via SINKRON Titipan',
            value: `- ${formatRupiah(result.nominalPotongTitipanOtomatis || 0)}`,
          });
          detailRows.push({
            label: 'Sisa Bon Bersih Wajib Bayar',
            value: result?.totalBonSebelum ?? sisaBonFisik,
          });
        } else {
          detailRows.push({
            label: 'Total Bon Sebelum Bayar',
            value: result?.totalBonSebelum ?? sisaBonFisik,
          });
        }

        detailRows.push({
          label: 'Nominal Setoran Diterima',
          value: result?.nominalBayar ?? nominalBayar,
          isTotal: true,
        });
        detailRows.push({
          label: 'Sisa Bon Tersisa',
          value: result?.sisaBonSetelah ?? 0,
          highlight: (result?.sisaBonSetelah ?? 0) > 0,
        });
      }

      if ((result?.nominalPengurangNotaNgunci || 0) > 0) {
        detailRows.push({
          label: 'Nominal Nota Kunci Sebelum Bayar',
          value: result?.sisaNotaNgunciSebelum ?? nominalNotaNgunciAwal,
        });
        detailRows.push({
          label: 'Otomatis Mengurangi Uang Tidak Bisa Kembali',
          value: `- ${formatRupiah(result.nominalPengurangNotaNgunci || 0)}`,
        });
        detailRows.push({
          label: 'Sisa Nominal Nota Kunci Setelah Bayar',
          value: result?.sisaNotaNgunciSetelah ?? 0,
        });
      }

      const receipt: ReceiptData = {
        title: isResultSinkron
          ? 'BUKTI SINKRON PELUNASAN BON MITRA'
          : 'KUITANSI RESMI PELUNASAN BON',
        subtitle: isResultSinkron
          ? 'Potong Langsung dari Saldo Titipan / Uang Hasil Bumi (Tanpa Uang Kas Keluar)'
          : isFull
          ? 'Status: LUNAS PENUH'
          : 'Status: PEMBAYARAN SEBAGIAN (ANGSURAN)',
        nomorTransaksi: result?.idTransaksi || `BYR-${Date.now().toString().slice(-4)}`,
        tanggal: result?.tanggal || new Date().toISOString().split('T')[0],
        jam: result?.jam || '00:00:00',
        mitra: result?.namaMitra || 'Mitra',
        rekening: result?.rekeningTujuan || (isResultSinkron ? 'SINKRON' : 'KAS01'),
        kategori: 'BAYAR_BON',
        detailRows,
        catatan: result?.keterangan || keterangan,
        kasir: 'Kasir Wijaya Agro',
      };

      try {
        onSuccess(receipt);
      } catch (err) {
        console.warn('onSuccess callback error in BayarBonView:', err);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses pelunasan bon');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
              Pelunasan Bon Mitra (Piutang ke PT)
            </h1>
            <span className="text-xs font-semibold text-cyan-900">
              · Mendukung Rekening SINKRON (Potong Titipan Tanpa Uang Keluar)
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Pelunasan bon mitra melalui setoran Tunai, Transfer Bank, atau pilih <strong>SINKRON</strong> untuk memotong langsung dari uang hasil bumi / titipan mitra.
          </p>
        </div>
      </div>

      {/* Info Rules Box */}
      <div className="p-4 bg-cyan-50/70 border border-cyan-200 rounded-xl text-xs text-cyan-950 space-y-1">
        <div className="flex items-center space-x-2 font-bold text-cyan-900">
          <Info className="w-4 h-4 text-cyan-700 shrink-0" />
          <span>Cara Kerja Rekening SINKRON pada Pelunasan Bon:</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          Contoh: Mitra memiliki <strong>Bon Rp 45 Juta</strong> dan <strong>Uang Kopi / Titipan Hasil Bumi Rp 60 Juta</strong>. Pilih metode <strong>SINKRON</strong> lalu klik proses — maka <strong>Bon Rp 45 Juta langsung LUNAS (Rp 0)</strong> tanpa mengeluarkan atau memasukkan kas fisik, dan sisa uang hasil bumi mitra otomatis menjadi <strong>Rp 15 Juta</strong> di menu <strong>Pembayaran PT ke Mitra</strong>.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input & Summary */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs p-5 space-y-4">
            <h2 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
              1. Pilih Mitra &amp; Cek Posisi Bon vs Titipan Hasil Bumi
            </h2>

            {/* Select Mitra */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Pilih Mitra <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedMitraId}
                onChange={(e) => setSelectedMitraId(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-600"
              >
                {sortedMitras.map((m) => {
                  const r = rekapMap.get(m.id);
                  const bonKotor = r?.totalBonMitra || 0;
                  const titip = r?.totalHutangTitipPanen || 0;
                  const ngunci = r?.nominalNotaNgunci || 0;
                  const ngunciTag = ngunci > 0 ? ` · NOTA KUNCI: ${formatRupiah(ngunci)}` : '';
                  let statusSuffix = 'Sisa Bon: Rp 0 (Lunas)';
                  if (bonKotor > 0 && titip >= bonKotor) {
                    statusSuffix = `Bon: ${formatRupiah(bonKotor)} · Titipan: ${formatRupiah(titip)} (Siap SINKRON)${ngunciTag}`;
                  } else if (bonKotor > 0 && titip > 0) {
                    statusSuffix = `Bon: ${formatRupiah(bonKotor)} · Titipan: ${formatRupiah(titip)} (Bisa SINKRON)${ngunciTag}`;
                  } else if (bonKotor > 0) {
                    statusSuffix = `Sisa Bon: ${formatRupiah(bonKotor)}${ngunciTag}`;
                  }
                  return (
                    <option key={m.id} value={m.id}>
                      {m.nama} ({m.kode}) — {statusSuffix}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Live Bon Breakdown Cards */}
            {loadingStatement ? (
              <div className="p-6 text-center text-xs text-zinc-400">Menghitung rincian bon &amp; titipan mitra...</div>
            ) : statementData ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-xs min-w-0 overflow-hidden">
                    <span className="text-[10px] text-zinc-500 font-semibold uppercase block truncate">
                      Total Bon Mitra
                    </span>
                    <div
                      className="text-sm font-bold text-rose-700 mt-1 font-mono tabular-nums truncate whitespace-nowrap"
                      title={formatRupiah(bonKotorAwal)}
                    >
                      {formatRupiahSingkat(bonKotorAwal)}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-xs min-w-0 overflow-hidden">
                    <span className="text-[10px] text-amber-800 font-semibold uppercase block truncate">
                      Uang Hasil Bumi / Titip
                    </span>
                    <div
                      className="text-sm font-bold text-amber-900 mt-1 font-mono tabular-nums truncate whitespace-nowrap"
                      title={formatRupiah(saldoTitipHasilBumi)}
                    >
                      {formatRupiahSingkat(saldoTitipHasilBumi)}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-cyan-50/80 border border-cyan-200 text-xs min-w-0 overflow-hidden">
                    <span className="text-[10px] text-cyan-800 font-semibold uppercase block truncate">
                      Bisa Dipotong SINKRON
                    </span>
                    <div
                      className="text-sm font-bold text-cyan-900 mt-1 font-mono tabular-nums truncate whitespace-nowrap"
                      title={formatRupiah(maksPotongSinkron)}
                    >
                      {maksPotongSinkron > 0 ? formatRupiahSingkat(maksPotongSinkron) : 'Rp 0'}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-xs min-w-0 overflow-hidden">
                    <span className="text-[10px] text-emerald-800 font-bold uppercase block truncate">
                      SISA BON SETOR FISIK
                    </span>
                    <div
                      className="text-base font-extrabold text-emerald-950 mt-1 font-mono tabular-nums truncate whitespace-nowrap"
                      title={formatRupiah(sisaBonFisik)}
                    >
                      {formatRupiahSingkat(sisaBonFisik)}
                    </div>
                  </div>
                </div>

                {/* Panel Pengurangan Otomatis Nominal Tidak Bisa Kembali (Mitra Berstatus Nota Kunci) */}
                {nominalNotaNgunciAwal > 0 && (
                  <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-xl text-xs space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <Lock className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                      <div className="space-y-1 flex-1">
                        <div className="font-bold text-rose-950">
                          Mitra Berstatus Nota Kunci — Pembayaran Otomatis Mengurangi Uang Tidak Bisa Kembali
                        </div>
                        <p className="text-rose-900/90 text-[11px] leading-relaxed">
                          Sistem otomatis memprioritaskan pelunasan pada <strong>Nota Kunci</strong> terlebih dahulu sehingga total nominal uang yang tidak bisa kembali langsung berkurang saat transaksi disimpan.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-rose-200 space-y-1 font-mono text-[11px] tabular-nums">
                      <div className="flex justify-between text-zinc-600">
                        <span className="font-sans">Nominal Nota Kunci (Tidak Bisa Kembali) Saat Ini:</span>
                        <span className="font-bold text-rose-800">{formatRupiah(nominalNotaNgunciAwal)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700">
                        <span className="font-sans">Otomatis Berkurang dari Pembayaran Ini:</span>
                        <span className="font-bold">- {formatRupiah(estimasiPengurangNotaNgunci)}</span>
                      </div>
                      <div className="flex justify-between pt-1.5 border-t border-zinc-200 text-zinc-900">
                        <span className="font-sans font-bold">Sisa Nominal Tidak Bisa Kembali Setelah Bayar:</span>
                        <span className={`font-extrabold ${estimasiSisaNotaNgunci === 0 ? 'text-emerald-700' : 'text-rose-800'}`}>
                          {formatRupiah(estimasiSisaNotaNgunci)}
                          {estimasiSisaNotaNgunci === 0 ? ' (Lunas & Pulih)' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Banner Siap SINKRON ketika Mitra punya Bon DAN punya Uang Hasil Bumi / Titipan */}
                {canUseSinkron && (
                  <div className="p-4 bg-cyan-50/80 border border-cyan-300 rounded-xl text-xs space-y-2.5">
                    <div className="flex items-start space-x-2.5">
                      <RefreshCw className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
                      <div className="space-y-1 flex-1">
                        <div className="font-bold text-cyan-950">
                          Tersedia Potong Bon via Rekening SINKRON (Tanpa Mengeluarkan Uang Kas)
                        </div>
                        <p className="text-cyan-900 text-[11px] leading-relaxed">
                          <strong>{statementData.namaMitra}</strong> memiliki bon{' '}
                          <strong className="font-mono">{formatRupiah(bonKotorAwal)}</strong> dan saldo titipan / uang hasil bumi{' '}
                          <strong className="font-mono">{formatRupiah(saldoTitipHasilBumi)}</strong>. Pilih metode{' '}
                          <strong>SINKRON</strong> di bawah untuk langsung melunasi/memotong bon dari uang hasil buminya tanpa transaksi kas fisik.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-cyan-200 space-y-1 font-mono text-[11px]">
                      <div className="flex justify-between text-zinc-600">
                        <span className="font-sans">Saldo Titipan / Uang Hasil Bumi Saat Ini:</span>
                        <span className="font-bold text-zinc-900">{formatRupiah(saldoTitipHasilBumi)}</span>
                      </div>
                      <div className="flex justify-between text-rose-700">
                        <span className="font-sans">Bon Mitra yang Dapat Dipotong SINKRON:</span>
                        <span className="font-bold">- {formatRupiah(maksPotongSinkron)}</span>
                      </div>
                      <div className="flex justify-between pt-1.5 border-t border-zinc-200 text-cyan-900">
                        <span className="font-sans font-bold">Sisa Bon Setelah SINKRON:</span>
                        <span className="font-extrabold">
                          {formatRupiah(Math.max(0, bonKotorAwal - maksPotongSinkron))}{' '}
                          {bonKotorAwal <= saldoTitipHasilBumi ? '(LUNAS)' : ''}
                        </span>
                      </div>
                      <div className="flex justify-between text-amber-900">
                        <span className="font-sans font-bold">Sisa Uang Hasil Bumi (PT Bayar ke Mitra):</span>
                        <span className="font-extrabold">{formatRupiah(sisaBayarPtKeMitra)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mitra sudah tidak memiliki bon sama sekali (misal setelah selesai di-SINKRON) */}
                {bonKotorAwal === 0 && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        <strong>{statementData.namaMitra}</strong> sudah bersih dari kewajiban bon (Sisa Bon: <strong>Rp 0</strong>).
                      </span>
                    </div>
                    {sisaBayarPtKeMitra > 0 && onNavigateToBayarTitipan && (
                      <button
                        type="button"
                        onClick={() => onNavigateToBayarTitipan(selectedMitraId)}
                        className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shrink-0 cursor-pointer"
                      >
                        <HandCoins className="w-3.5 h-3.5" />
                        <span>Lanjut Pembayaran PT ke Mitra ({formatRupiah(sisaBayarPtKeMitra)})</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {/* Input Metode & Nominal Pelunasan */}
            <div className="pt-2 border-t border-zinc-100 space-y-3.5">
              <label className="block text-xs font-bold text-zinc-900 uppercase tracking-wider">
                2. Pilih Metode Rekening &amp; Nominal Pelunasan Bon
              </label>

              {/* Payment Method (3 Options: SINKRON, TUNAI, TRANSFER) */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1.5">
                  Pilih Metode / Rekening Pelunasan <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={!canUseSinkron}
                    onClick={() => handleSelectMetode('SINKRON')}
                    className={`py-2.5 px-3 text-center rounded-lg font-bold text-xs border transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed ${
                      metode === 'SINKRON'
                        ? 'bg-cyan-700 text-white border-cyan-700 shadow-xs'
                        : 'bg-cyan-50/70 text-cyan-900 border-cyan-300 hover:bg-cyan-100'
                    } disabled:opacity-45`}
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span>Sinkron (Potong Titipan)</span>
                  </button>

                  <button
                    type="button"
                    disabled={sisaBonFisik <= 0}
                    onClick={() => handleSelectMetode('TUNAI')}
                    className={`py-2.5 px-3 text-center rounded-lg font-semibold text-xs border transition-all cursor-pointer disabled:cursor-not-allowed ${
                      metode === 'TUNAI'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                    } disabled:opacity-45`}
                  >
                    Tunai (Masuk KAS01)
                  </button>

                  <button
                    type="button"
                    disabled={sisaBonFisik <= 0}
                    onClick={() => handleSelectMetode('TRANSFER')}
                    className={`py-2.5 px-3 text-center rounded-lg font-semibold text-xs border transition-all cursor-pointer disabled:cursor-not-allowed ${
                      metode === 'TRANSFER'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                    } disabled:opacity-45`}
                  >
                    Transfer Rekening Bank
                  </button>
                </div>
              </div>

              {/* Detail Rekening Sesuai Metode */}
              {metode === 'SINKRON' ? (
                <div className="p-3 bg-cyan-50/80 rounded-lg border border-cyan-200 text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-cyan-900">Rekening Kliring Sistem:</span>
                    <span className="font-mono font-bold text-cyan-950">
                      SINKRON ({sinkronRek?.nama || 'Potong Titipan / Uang Hasil Bumi'})
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-cyan-900">Uang Kas Keluar / Masuk:</span>
                    <span className="font-mono font-bold text-emerald-800">
                      Rp 0 (Tidak Mengeluarkan Uang Fisik)
                    </span>
                  </div>
                  <div className="text-[11px] text-cyan-800 pt-0.5">
                    Langsung memotong Saldo Titipan / Uang Hasil Bumi milik{' '}
                    <strong>{statementData?.namaMitra || 'Mitra'}</strong> sehingga bon berkurang permanen di buku mitra.
                  </div>
                </div>
              ) : metode === 'TUNAI' ? (
                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Rekening Tujuan Penerima:</span>
                    <span className="font-mono font-bold text-zinc-900">KAS01 (Kas Utama)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Saldo KAS01 Saat Ini:</span>
                    <span className="font-bold text-emerald-800">{formatRupiah(kas01?.saldoSaatIni || 0)}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Kas fisik di kasir akan bertambah langsung sebesar nominal setoran sisa bon.
                  </div>
                </div>
              ) : (
                <div className="space-y-2 p-3 bg-sky-50 rounded-lg border border-sky-200 text-xs">
                  <label className="block font-semibold text-sky-900">
                    Pilih Rekening Bank Penerima Dana <span className="text-rose-500">*</span>:
                  </label>
                  <select
                    value={rekeningTujuan}
                    onChange={(e) => setRekeningTujuan(e.target.value)}
                    className="w-full px-2.5 py-2 border border-sky-300 rounded bg-white text-xs font-medium"
                  >
                    {availableBanks.map((b) => (
                      <option key={b.kode} value={b.kode}>
                        {b.nama} ({b.kode}) — Saldo: {formatRupiah(b.saldoSaatIni)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Nominal Input */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  {metode === 'SINKRON'
                    ? 'Nominal Bon yang Dipotong dari Uang Hasil Bumi / Titipan (Rp)'
                    : 'Nominal Uang Setoran Diterima Kasir dari Mitra (Rp)'}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="0"
                    max={targetMaksBayar || undefined}
                    disabled={targetMaksBayar <= 0}
                    value={nominalBayarInput}
                    onChange={(e) => setNominalBayarInput(e.target.value)}
                    className="flex-1 px-3 py-2.5 border border-zinc-300 rounded-lg text-sm font-mono font-bold focus:ring-1 focus:ring-emerald-600 disabled:bg-zinc-100 disabled:text-zinc-400"
                  />
                  {targetMaksBayar > 0 && (
                    <button
                      type="button"
                      onClick={() => setNominalBayarInput(targetMaksBayar.toString())}
                      className={`px-3 py-2.5 text-xs font-bold rounded-lg transition-colors shrink-0 cursor-pointer ${
                        metode === 'SINKRON'
                          ? 'bg-cyan-100 hover:bg-cyan-200 text-cyan-900'
                          : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                      }`}
                    >
                      {metode === 'SINKRON'
                        ? `Sinkron Penuh (${formatRupiahSingkat(targetMaksBayar)})`
                        : `Bayar Lunas (${formatRupiahSingkat(targetMaksBayar)})`}
                    </button>
                  )}
                </div>
                <div className="text-xs font-semibold text-emerald-800 mt-1">{formatRupiah(nominalBayar)}</div>
              </div>

              {/* Status Indicator */}
              {isFull && (
                <div
                  className={`p-2.5 rounded-lg border text-xs font-medium ${
                    metode === 'SINKRON'
                      ? 'bg-cyan-50 text-cyan-900 border-cyan-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}
                >
                  {metode === 'SINKRON' ? (
                    <>
                      ✓ Sinkron Penuh — Bon sebesar <strong>{formatRupiah(nominalBayar)}</strong> langsung dipotong dari uang hasil bumi/titipan tanpa kas keluar. Sisa bon menjadi{' '}
                      <strong>{formatRupiah(sisaBonSetelahTransaksi)}</strong> dan sisa uang hasil bumi mitra menjadi{' '}
                      <strong>{formatRupiah(sisaTitipanSetelahSinkron)}</strong>.
                    </>
                  ) : (
                    <>
                      ✓ Pembayaran Lunas Penuh — Seluruh sisa kewajiban bon mitra ({formatRupiah(targetMaksBayar)}) akan ditutup menjadi LUNAS.
                    </>
                  )}
                </div>
              )}
              {isPartial && (
                <div className="p-2.5 bg-amber-50 text-amber-800 rounded-lg border border-amber-200 text-xs font-medium">
                  ℹ Pelunasan Sebagian — Sisa bon mitra setelah transaksi ini:{' '}
                  <strong>{formatRupiah(sisaBonSetelahTransaksi)}</strong>.
                </div>
              )}
              {isOver && (
                <div className="p-2.5 bg-rose-50 text-rose-800 rounded-lg border border-rose-200 text-xs font-medium">
                  ⚠ Nominal melebihi batas maksimal ({formatRupiah(targetMaksBayar)})!
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">Keterangan / Catatan</label>
                <input
                  type="text"
                  disabled={targetMaksBayar <= 0}
                  placeholder="Misal: Sinkron potong bon dari uang kopi mitra"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs disabled:bg-zinc-100"
                />
              </div>

              <button
                type="button"
                disabled={nominalBayar <= 0 || targetMaksBayar <= 0 || isOver}
                onClick={() => setShowConfirmModal(true)}
                className={`w-full py-2.5 disabled:opacity-50 text-white font-bold text-sm rounded-lg shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed ${
                  metode === 'SINKRON'
                    ? 'bg-cyan-700 hover:bg-cyan-800'
                    : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
              >
                {bonKotorAwal <= 0
                  ? 'Mitra Tidak Memiliki Sisa Bon (Rp 0)'
                  : metode === 'SINKRON'
                  ? `Proses Pelunasan Bon via SINKRON (${formatRupiah(nominalBayar)})`
                  : `Proses Pelunasan Bon (${formatRupiah(nominalBayar)})`}
              </button>
            </div>
          </div>
        </div>

        {/* Right: History Bayar Bon */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-emerald-700" />
                <h2 className="text-xs font-bold text-zinc-900 uppercase">Riwayat Pelunasan Bon</h2>
              </div>
              <span className="text-xs text-zinc-500">{bayarBonList.length} Transaksi</span>
            </div>

            <div className="divide-y divide-zinc-100 max-h-[540px] overflow-y-auto text-xs">
              {bayarBonList.length === 0 ? (
                <div className="py-12 text-center text-zinc-400">Belum ada riwayat pembayaran bon</div>
              ) : (
                bayarBonList.map((b) => {
                  const isRowSinkron =
                    b.metode === 'SINKRON' ||
                    b.metode === 'KOMPENSASI_TITIP' ||
                    b.rekeningTujuan === 'SINKRON' ||
                    Boolean(b.isKompensasiTitipan);
                  return (
                    <div key={b.idTransaksi} className="p-3.5 hover:bg-zinc-50/70 transition-colors space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-zinc-900">{b.idTransaksi}</span>
                        <span
                          className={`font-bold font-mono ${
                            isRowSinkron ? 'text-cyan-800' : 'text-emerald-800'
                          }`}
                        >
                          {formatRupiah(b.nominalBayar)}
                        </span>
                      </div>

                      <div className="flex justify-between text-[11px] text-zinc-600">
                        <span>
                          Mitra: <strong>{b.namaMitra}</strong>
                        </span>
                        <span>
                          Rekening:{' '}
                          <strong className={`font-mono ${isRowSinkron ? 'text-cyan-900' : ''}`}>
                            {b.rekeningTujuan}
                          </strong>{' '}
                          ({isRowSinkron ? 'SINKRON Non-Tunai' : b.metode})
                        </span>
                      </div>

                      <div className="flex justify-between text-[10px] text-zinc-500 pt-0.5">
                        <span>Sebelum: {formatRupiah(b.totalBonSebelum)}</span>
                        <span>
                          Sisa Bon:{' '}
                          <strong className={b.sisaBonSetelah > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                            {formatRupiah(b.sisaBonSetelah)}
                          </strong>
                        </span>
                      </div>
                      {(b.nominalPengurangNotaNgunci || 0) > 0 && (
                        <div className="flex justify-between text-[10px] text-rose-800 bg-rose-50/80 px-2 py-1 rounded border border-rose-100 font-medium">
                          <span>Pengurang Nota Kunci:</span>
                          <span className="font-mono font-bold tabular-nums">
                            - {formatRupiah(b.nominalPengurangNotaNgunci || 0)}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1">
                        <span className="truncate max-w-[180px]">{b.keterangan}</span>
                        <div className="flex items-center gap-2">
                          <span>
                            {b.tanggal} · {b.jam}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditTxId(b.idTransaksi)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-900 text-zinc-700 hover:text-white border border-zinc-200 font-semibold text-[10px] transition-colors cursor-pointer"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                            <span>Edit</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div
              className={`p-4 text-white font-bold text-sm flex justify-between items-center ${
                metode === 'SINKRON' ? 'bg-cyan-800' : 'bg-emerald-800'
              }`}
            >
              <span>
                {metode === 'SINKRON'
                  ? 'Konfirmasi Pelunasan Bon via SINKRON'
                  : 'Konfirmasi Pelunasan Bon Mitra'}
              </span>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-zinc-700">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Nama Mitra:</span>
                  <span className="font-bold text-zinc-900">{statementData?.namaMitra}</span>
                </div>

                {metode === 'SINKRON' ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Total Bon Mitra Saat Ini:</span>
                      <span className="font-mono font-semibold text-rose-700">
                        {formatRupiah(bonKotorAwal)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Saldo Uang Hasil Bumi / Titipan:</span>
                      <span className="font-mono font-semibold text-amber-800">
                        {formatRupiah(saldoTitipHasilBumi)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Rekening Kliring:</span>
                      <span className="font-mono font-bold text-cyan-800">
                        SINKRON (Rp 0 Kas Keluar/Masuk)
                      </span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t border-zinc-200">
                      <span className="text-zinc-700 font-bold">Nominal Dipotong via SINKRON:</span>
                      <span className="font-bold text-sm text-cyan-800 font-mono">
                        {formatRupiah(nominalBayar)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-zinc-600 pt-1">
                      <span>Sisa Bon Mitra Setelahnya:</span>
                      <span className="font-mono font-bold text-emerald-800">
                        {formatRupiah(sisaBonSetelahTransaksi)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-amber-900">
                      <span>Sisa Uang Hasil Bumi Mitra:</span>
                      <span className="font-mono font-bold">
                        {formatRupiah(sisaTitipanSetelahSinkron)}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    {maksPotongSinkron > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Total Bon Awal:</span>
                          <span className="font-mono text-zinc-800">{formatRupiah(bonKotorAwal)}</span>
                        </div>
                        <div className="flex justify-between text-cyan-800">
                          <span>Dipotong Otomatis via SINKRON Titipan:</span>
                          <span className="font-mono font-semibold">- {formatRupiah(maksPotongSinkron)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Sisa Bon Bersih Wajib Bayar:</span>
                      <span className="font-semibold text-zinc-800 font-mono">{formatRupiah(sisaBonFisik)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Rekening Masuk Kas:</span>
                      <span className="font-mono font-bold text-emerald-800">
                        {metode === 'TUNAI' ? 'KAS01' : rekeningTujuan}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-zinc-200">
                      <span className="text-zinc-500 font-bold">Nominal Setoran Diterima:</span>
                      <span className="font-bold text-sm text-emerald-800 font-mono">
                        {formatRupiah(nominalBayar)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-zinc-500 pt-1">
                      <span>Sisa Bon Mitra Setelahnya:</span>
                      <span className="font-mono font-bold text-zinc-900">
                        {formatRupiah(sisaBonSetelahTransaksi)}
                      </span>
                    </div>
                  </>
                )}

                {estimasiPengurangNotaNgunci > 0 && (
                  <div className="pt-2 mt-2 border-t border-rose-200 space-y-1 text-[11px]">
                    <div className="flex justify-between text-emerald-800 font-semibold">
                      <span>Otomatis Mengurangi Nota Kunci:</span>
                      <span className="font-mono font-bold tabular-nums">
                        - {formatRupiah(estimasiPengurangNotaNgunci)}
                      </span>
                    </div>
                    <div className="flex justify-between text-rose-900">
                      <span>Sisa Uang Tidak Bisa Kembali:</span>
                      <span className="font-mono font-bold tabular-nums">
                        {formatRupiah(estimasiSisaNotaNgunci)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-md font-medium cursor-pointer"
                >
                  Batal / Cek Lagi
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleProcessSubmit}
                  className={`px-4 py-1.5 text-white font-bold rounded-md disabled:opacity-50 cursor-pointer ${
                    metode === 'SINKRON'
                      ? 'bg-cyan-700 hover:bg-cyan-800'
                      : 'bg-emerald-700 hover:bg-emerald-800'
                  }`}
                >
                  {submitting
                    ? 'Memproses...'
                    : metode === 'SINKRON'
                    ? 'Konfirmasi & Potong via SINKRON'
                    : 'Konfirmasi & Terima Pembayaran'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Universal Edit Detail Pembayaran Bon */}
      <ModalEditTransaksiUniversal
        isOpen={Boolean(editTxId)}
        transactionId={editTxId}
        jenisHint="BAYAR_BON"
        onClose={() => setEditTxId(null)}
        onSuccess={() => {
          onRefresh();
          loadRekapMitra();
          if (selectedMitraId) {
            api
              .getRekeningKoranMitra(selectedMitraId)
              .then((data) => {
                setStatementData(data);
                applyDefaultModeForStatement(data);
              })
              .catch(() => {});
          }
        }}
      />
    </div>
  );
};
