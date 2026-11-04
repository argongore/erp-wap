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
  ArrowRightLeft,
  Scale,
} from 'lucide-react';
import {
  getRoleMitraLabel,
  Mitra,
  Rekening,
  TransaksiKasbonUang,
  TransaksiPembelianBarang,
  TransaksiPembelianHasilBumi,
  TransaksiPencairanTitipan,
  TransaksiPenjualan,
  TransaksiPenjualanHasilBumi,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat, dmyToIsoInput } from '../../utils/format.ts';
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

type ModePembayaranTitipan = 'AMBIL_TANPA_POTONG_BON' | 'KLIRING_DAN_BAYAR';

export const BayarTitipanHasilBumiView: React.FC<Props> = ({
  mitraList,
  rekeningList,
  pembelianList,
  pembelianBarangList = [],
  penjualanList = [],
  penjualanHasilBumiList = [],
  kasbonUangList = [],
  initialSelectedMitraId,
  onRefresh,
  onPrintReceipt,
}) => {
  const [selectedMitraId, setSelectedMitraId] = useState<string>(initialSelectedMitraId || '');
  const [modeBayar, setModeBayar] = useState<ModePembayaranTitipan>('AMBIL_TANPA_POTONG_BON');
  const [nominalPotongBonInput, setNominalPotongBonInput] = useState<string>('');
  const [nominalInput, setNominalInput] = useState<string>('');
  const [rekeningSumber, setRekeningSumber] = useState<string>('KAS01');
  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER' | 'SINKRON'>('TUNAI');
  const [keterangan, setKeterangan] = useState<string>('');
  const [tanggalInput, setTanggalInput] = useState<string>(dmyToIsoInput());

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [pinjamUangModalOpen, setPinjamUangModalOpen] = useState<boolean>(false);

  const [pencairanList, setPencairanList] = useState<TransaksiPencairanTitipan[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [editTxId, setEditTxId] = useState<string | null>(null);

  useEffect(() => {
    if (initialSelectedMitraId) {
      setSelectedMitraId(initialSelectedMitraId);
    }
  }, [initialSelectedMitraId]);

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

  // Hitung saldo Titipan & Piutang berjalan tiap mitra (selisih ditampilkan walau belum kliring)
  const partnerPositionMap = useMemo(() => {
    const map = new Map<
      string,
      {
        totalTitipKotor: number;
        totalDicairkan: number;
        saldoTitipAktif: number;
        saldoBonAktif: number;
        potongBonMaksimal: number;
        selisihHutangPt: number;
        selisihPiutangMitra: number;
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
          potongBonMaksimal: 0,
          selisihHutangPt: 0,
          selisihPiutangMitra: 0,
        };
        map.set(idMitra, cur);
      }
      return cur;
    };

    for (const p of pembelianList) {
      if (p.metodePembayaran === 'TITIP' && p.idMitra) {
        const cur = ensureEntry(p.idMitra);
        cur.totalTitipKotor += p.totalNominal;
      }
    }

    for (const pb of pembelianBarangList) {
      if (pb.metodePembayaran === 'HUTANG' && pb.status !== 'LUNAS' && pb.idMitra) {
        const cur = ensureEntry(pb.idMitra);
        cur.totalTitipKotor += pb.totalNominal;
      }
    }

    for (const pt of pencairanList) {
      if (pt.idMitra) {
        const cur = ensureEntry(pt.idMitra);
        cur.totalDicairkan += pt.nominalPencairan;
      }
    }

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

    map.forEach((cur) => {
      cur.saldoTitipAktif = Math.max(0, cur.totalTitipKotor - cur.totalDicairkan);
      cur.potongBonMaksimal = Math.min(cur.saldoTitipAktif, cur.saldoBonAktif);
      cur.selisihHutangPt = Math.max(0, cur.saldoTitipAktif - cur.saldoBonAktif);
      cur.selisihPiutangMitra = Math.max(0, cur.saldoBonAktif - cur.saldoTitipAktif);
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

  const activeTitipPartners = useMemo(() => {
    return mitraList
      .map((m) => {
        const pos = partnerPositionMap.get(m.id) || {
          totalTitipKotor: 0,
          totalDicairkan: 0,
          saldoTitipAktif: 0,
          saldoBonAktif: 0,
          potongBonMaksimal: 0,
          selisihHutangPt: 0,
          selisihPiutangMitra: 0,
        };
        return {
          ...m,
          ...pos,
        };
      })
      .filter((m) => m.saldoTitipAktif > 0 || m.id === selectedMitraId)
      .sort((a, b) => {
        if (b.saldoTitipAktif !== a.saldoTitipAktif) {
          return b.saldoTitipAktif - a.saldoTitipAktif;
        }
        return b.selisihHutangPt - a.selisihHutangPt;
      });
  }, [mitraList, partnerPositionMap, selectedMitraId]);

  const { grandTotalTitipAktif, grandTotalSelisihHutang, activeTitipPartnerCount } = useMemo(() => {
    let titipSum = 0;
    let netHutangSum = 0;
    let count = 0;
    partnerPositionMap.forEach((v) => {
      if (v.saldoTitipAktif > 0) {
        titipSum += v.saldoTitipAktif;
        netHutangSum += v.selisihHutangPt;
        count += 1;
      }
    });
    return {
      grandTotalTitipAktif: titipSum,
      grandTotalSelisihHutang: netHutangSum,
      activeTitipPartnerCount: count,
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
        potongBonMaksimal: 0,
        selisihHutangPt: 0,
        selisihPiutangMitra: 0,
      }
    );
  }, [selectedMitraId, partnerPositionMap]);

  const selectedMitraTitipanKotor = selectedPos?.saldoTitipAktif || 0;
  const selectedMitraBonAktif = selectedPos?.saldoBonAktif || 0;
  const selectedPotongBonMaks = selectedPos?.potongBonMaksimal || 0;
  const selectedSelisihHutangPt = selectedPos?.selisihHutangPt || 0;
  const selectedSelisihPiutangMitra = selectedPos?.selisihPiutangMitra || 0;

  // Reset form defaults when partner changes
  useEffect(() => {
    if (!selectedMitraId) {
      setNominalInput('');
      setNominalPotongBonInput('');
      setModeBayar('AMBIL_TANPA_POTONG_BON');
      return;
    }
    setModeBayar('AMBIL_TANPA_POTONG_BON');
    setNominalPotongBonInput(
      selectedPotongBonMaks > 0 ? String(selectedPotongBonMaks) : '0'
    );
    if (selectedSelisihHutangPt > 0) {
      setNominalInput(String(selectedSelisihHutangPt));
    } else if (selectedMitraTitipanKotor > 0) {
      setNominalInput(String(selectedMitraTitipanKotor));
    } else {
      setNominalInput('0');
    }
  }, [selectedMitraId]);

  const isKliringMode = selectedMitraBonAktif > 0 && modeBayar === 'KLIRING_DAN_BAYAR';
  const parsedPotongBon = isKliringMode
    ? Math.min(
        Math.max(0, Math.round(Number(nominalPotongBonInput) || 0)),
        selectedPotongBonMaks
      )
    : 0;
  const batasMaksAmbilUang = Math.max(0, selectedMitraTitipanKotor - parsedPotongBon);
  const parsedNominalFisik = Math.max(0, Math.round(Number(nominalInput) || 0));

  const simSisaTitipAkhir = Math.max(
    0,
    selectedMitraTitipanKotor - parsedPotongBon - parsedNominalFisik
  );
  const simSisaPiutangAkhir = Math.max(0, selectedMitraBonAktif - parsedPotongBon);
  const simNetHutangAkhir = Math.max(0, simSisaTitipAkhir - simSisaPiutangAkhir);
  const simNetPiutangAkhir = Math.max(0, simSisaPiutangAkhir - simSisaTitipAkhir);

  const handleSwitchMode = (nextMode: ModePembayaranTitipan) => {
    setModeBayar(nextMode);
    if (nextMode === 'AMBIL_TANPA_POTONG_BON') {
      setNominalPotongBonInput('0');
      setNominalInput(
        String(
          selectedSelisihHutangPt > 0
            ? selectedSelisihHutangPt
            : selectedMitraTitipanKotor
        )
      );
    } else {
      const defPotong = selectedPotongBonMaks;
      setNominalPotongBonInput(String(defPotong));
      const sisaCair = Math.max(0, selectedMitraTitipanKotor - defPotong);
      setNominalInput(String(sisaCair));
    }
  };

  const selectedRekening = useMemo(
    () => rekeningList.find((r) => r.kode === rekeningSumber),
    [rekeningList, rekeningSumber]
  );

  const executePayment = async (nominalToPay: number, potongBonNominal: number) => {
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedMitraId) {
      setErrorMsg('Pilih mitra yang akan mengambil uang titipan / kliring.');
      return;
    }

    if (selectedMitraTitipanKotor <= 0) {
      setErrorMsg('Mitra ini tidak memiliki saldo titipan aktif.');
      return;
    }

    const useKliring = potongBonNominal > 0;
    const isZeroCashKliringOnly = nominalToPay === 0 && useKliring;

    if (!isZeroCashKliringOnly && nominalToPay <= 0) {
      setErrorMsg('Masukkan nominal pengambilan uang lebih dari Rp 0 (atau isi nominal potong bon).');
      return;
    }

    if (potongBonNominal > selectedPotongBonMaks) {
      setErrorMsg(
        `Nominal potong bon melebihi batas maksimal kliring (${formatRupiah(selectedPotongBonMaks)}).`
      );
      return;
    }

    const maxCashAllowed = Math.max(0, selectedMitraTitipanKotor - potongBonNominal);
    if (nominalToPay > maxCashAllowed) {
      setErrorMsg(
        `Nominal uang diambil (${formatRupiah(nominalToPay)}) melebihi sisa saldo titipan (${formatRupiah(maxCashAllowed)}).`
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
      metode !== 'SINKRON' &&
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
        rekeningSumber:
          isZeroCashKliringOnly || metode === 'SINKRON' ? 'SINKRON' : rekeningSumber,
        metode: isZeroCashKliringOnly ? 'SINKRON' : metode,
        keterangan: keterangan.trim() || undefined,
        tanggal: tanggalInput,
        potongBonOtomatis: useKliring,
        nominalPotongBon: useKliring ? potongBonNominal : 0,
      });

      const sisaPiutangBaru = Math.max(0, selectedMitraBonAktif - potongBonNominal);
      const sisaTitipBaru = Math.max(
        0,
        selectedMitraTitipanKotor - potongBonNominal - nominalToPay
      );
      const labelPosisiBaru =
        sisaTitipBaru > sisaPiutangBaru
          ? `HUTANG ${formatRupiah(sisaTitipBaru - sisaPiutangBaru)}`
          : sisaPiutangBaru > sisaTitipBaru
            ? `PIUTANG ${formatRupiah(sisaPiutangBaru - sisaTitipBaru)}`
            : 'IMPAS (Rp 0)';

      if (isZeroCashKliringOnly) {
        setSuccessMsg(
          `Kliring silang berhasil! Piutang ${selectedMitra?.nama} berkurang ${formatRupiah(
            potongBonNominal
          )} menjadi sisa ${formatRupiah(sisaPiutangBaru)} (Posisi sekarang: ${labelPosisiBaru}).`
        );
      } else if (useKliring) {
        setSuccessMsg(
          `Berhasil! Bon ${selectedMitra?.nama} dipotong ${formatRupiah(
            potongBonNominal
          )} & uang tunai/transfer ${formatRupiah(
            nominalToPay
          )} diserahkan. Posisi sekarang: ${labelPosisiBaru}.`
        );
      } else {
        setSuccessMsg(
          `Uang titipan ${formatRupiah(nominalToPay)} diserahkan ke ${
            selectedMitra?.nama
          } tanpa potong bon (Piutang tetap ${formatRupiah(
            selectedMitraBonAktif
          )} · Yang Harus Dibayar sekarang: ${labelPosisiBaru}).`
        );
      }

      setKeterangan('');
      onRefresh();
      await loadHistory();

      if (onPrintReceipt && selectedMitra && (nominalToPay > 0 || potongBonNominal > 0)) {
        const potongBon = record.nominalPotongBonOtomatis || potongBonNominal;
        const titipAwalKotor = record.totalTitipanAwalKotor || selectedMitraTitipanKotor;

        const detailRows: ReceiptData['detailRows'] = [
          { label: 'Nomor Transaksi', value: record.idPencairan },
          { label: 'Penerima / Mitra', value: `${selectedMitra.nama} (${selectedMitra.kode})` },
          {
            label: 'Metode Penyelesaian',
            value: isZeroCashKliringOnly
              ? 'KLIRING SILANG NON-TUNAI'
              : `${metode} via ${selectedRekening?.nama || rekeningSumber}`,
          },
          { label: 'Piutang Mitra Sebelum', value: formatRupiah(selectedMitraBonAktif) },
          { label: 'Saldo Titipan Sebelum', value: formatRupiah(titipAwalKotor) },
        ];

        if (potongBon > 0) {
          detailRows.push({
            label: 'Kliring Potong / Angsur Bon',
            value: `- ${formatRupiah(potongBon)}`,
            highlight: true,
          });
        }

        if (nominalToPay > 0) {
          detailRows.push({
            label:
              potongBon > 0
                ? 'Uang Bersih Diserahkan ke Mitra'
                : 'Uang Titipan Diambil (Tanpa Potong Bon)',
            value: formatRupiah(nominalToPay),
            isTotal: true,
            highlight: true,
          });
        }

        detailRows.push({
          label: 'Sisa Piutang Mitra',
          value: formatRupiah(sisaPiutangBaru),
        });
        detailRows.push({
          label: 'Sisa Saldo Titipan',
          value: formatRupiah(sisaTitipBaru),
        });
        detailRows.push({
          label: 'Yang Harus Dibayar Sesudahnya',
          value: labelPosisiBaru,
          isTotal: nominalToPay === 0,
        });

        onPrintReceipt({
          title: isZeroCashKliringOnly
            ? 'BUKTI KLIRING SILANG TITIPAN KE BON MITRA'
            : 'BUKTI PEMBAYARAN PT KE MITRA (TITIPAN / PANEN)',
          subtitle:
            potongBon > 0
              ? 'TERMASUK KLIRING POTONG / ANGSUR BON MITRA'
              : selectedMitraBonAktif > 0
                ? 'AMBIL UANG DULU TANPA POTONG BON (PIUTANG TETAP)'
                : 'PT WIJAYA AGRO PERKASA',
          nomorTransaksi: record.idPencairan,
          nomorNota: record.idPencairan,
          tanggal: record.tanggal,
          jam: record.jam,
          kasir: 'KasirWap',
          kategori: isZeroCashKliringOnly ? 'KLIRING SILANG' : 'PEMBAYARAN PT KE MITRA',
          mitra: selectedMitra.nama,
          namaMitra: selectedMitra.nama,
          roleMitra: getRoleMitraLabel(selectedMitra.role, {
            isAnakPerusahaan: selectedMitra.isAnakPerusahaan,
            isKaryawan: Boolean(selectedMitra.idKaryawanTerkait),
          }),
          rekening: isZeroCashKliringOnly
            ? 'KLIRING NON-TUNAI'
            : selectedRekening?.nama || rekeningSumber,
          detailRows,
          items: [
            {
              nama: isZeroCashKliringOnly
                ? `Kliring Silang Titipan ke Piutang Bon (${formatRupiah(potongBon)})`
                : potongBon > 0
                  ? `Pembayaran Titipan (Setelah Kliring Bon ${formatRupiah(potongBon)})`
                  : 'Pengambilan Uang Titipan (Tanpa Potong Bon)',
              qty: 1,
              satuan: 'Trx',
              harga: nominalToPay > 0 ? nominalToPay : potongBon,
              subtotal: nominalToPay > 0 ? nominalToPay : potongBon,
            },
          ],
          total: nominalToPay > 0 ? nominalToPay : potongBon,
          terbilang: `${formatRupiah(nominalToPay > 0 ? nominalToPay : potongBon)}`,
          catatan: `Yang Harus Dibayar sekarang: ${labelPosisiBaru} (Sisa Piutang: ${formatRupiah(
            sisaPiutangBaru
          )}, Sisa Titipan: ${formatRupiah(sisaTitipBaru)})`,
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses transaksi pembayaran ke mitra');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executePayment(parsedNominalFisik, parsedPotongBon);
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
          <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
            Pembayaran Titipan Hasil Bumi &amp; Kliring Bon Mitra
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Tampilkan posisi Hutang/Piutang bersih sebelum kliring — mitra bebas ambil uang titipan dulu tanpa potong bon, atau kliring angsur/lunasi bon saat pembayaran.
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
          <div className="flex items-center justify-between gap-2 text-xs text-amber-900 font-semibold mb-1 min-w-0">
            <span className="truncate">Total Saldo Titipan Aktif</span>
            <Wheat className="w-4 h-4 text-amber-700 shrink-0" />
          </div>
          <div
            className="text-2xl font-black text-amber-950 font-mono tabular-nums truncate whitespace-nowrap"
            title={formatRupiah(grandTotalTitipAktif)}
          >
            {formatRupiahSingkat(grandTotalTitipAktif)}
          </div>
          <div className="text-[11px] text-amber-800 mt-1 truncate">
            Selisih Hutang Bersih PT: {formatRupiahSingkat(grandTotalSelisihHutang)}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 text-xs text-emerald-800 font-semibold mb-1 min-w-0">
            <span className="truncate">Kas Kasir Bersih Tersedia</span>
            <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <div
            className="text-2xl font-black text-emerald-950 font-mono tabular-nums truncate whitespace-nowrap"
            title={formatRupiah(rekeningList.find((r) => r.kode === 'KAS01')?.saldoSaatIni || 0)}
          >
            {formatRupiahSingkat(rekeningList.find((r) => r.kode === 'KAS01')?.saldoSaatIni || 0)}
          </div>
          <div className="text-[11px] text-emerald-700 mt-1 truncate">
            Siap untuk penyerahan uang tunai di kasir
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-100 border border-zinc-200 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 text-xs text-zinc-700 font-semibold mb-1 min-w-0">
            <span className="truncate">Mitra Memiliki Saldo Titipan</span>
            <UserCheck className="w-4 h-4 text-zinc-600 shrink-0" />
          </div>
          <div className="text-2xl font-black text-zinc-950 font-mono tabular-nums truncate whitespace-nowrap">
            {activeTitipPartnerCount} Mitra
          </div>
          <div className="text-[11px] text-zinc-600 mt-1 truncate">
            Bisa ambil uang dulu atau kliring potong bon
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
              <span>Formulir Pengambilan Titipan &amp; Kliring Pembayaran</span>
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Pilih ambil uang dulu (piutang tetap) atau potong/angsur bon saat pembayaran
            </p>
          </div>

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Pilih Mitra */}
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Pilih Mitra Pemilik Titipan <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={selectedMitraId}
                onChange={(e) => setSelectedMitraId(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-zinc-900 text-zinc-800 font-semibold"
              >
                <option value="">-- Pilih Mitra --</option>
                {activeTitipPartners.map((m) => {
                  let labelSaldo = '';
                  if (m.selisihHutangPt > 0) {
                    labelSaldo = `Hutang: ${formatRupiah(m.selisihHutangPt)} (Titip ${formatRupiahSingkat(
                      m.saldoTitipAktif
                    )}${m.saldoBonAktif > 0 ? ` − Piutang ${formatRupiahSingkat(m.saldoBonAktif)}` : ''})`;
                  } else if (m.selisihPiutangMitra > 0) {
                    labelSaldo = `Titip ${formatRupiahSingkat(
                      m.saldoTitipAktif
                    )} | Piutang: ${formatRupiah(m.selisihPiutangMitra)}`;
                  } else {
                    labelSaldo = `Impas Rp 0 (Titip ${formatRupiahSingkat(m.saldoTitipAktif)} = Piutang)`;
                  }
                  return (
                    <option key={m.id} value={m.id}>
                      {m.nama} — {labelSaldo}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Rincian Posisi Berjalan (Walaupun Belum Di-Kliring) */}
            {selectedMitra && (
              <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-zinc-900">
                    Posisi Saldo {selectedMitra.nama} (Sebelum Kliring)
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white border border-zinc-200 space-y-1.5 font-mono tabular-nums text-[11px]">
                  <div className="flex justify-between text-zinc-600">
                    <span className="font-sans">Saldo Titipan / Hasil Panen:</span>
                    <span className="font-bold text-emerald-800">
                      {formatRupiah(selectedMitraTitipanKotor)}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-600">
                    <span className="font-sans">Saldo Piutang / Bon Berjalan:</span>
                    <span className="font-bold text-rose-800">
                      {formatRupiah(selectedMitraBonAktif)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-zinc-200">
                    <span className="font-sans font-bold text-zinc-900">
                      Yang Harus Dibayar Saat Ini:
                    </span>
                    <span
                      className={`font-black text-sm ${
                        selectedSelisihHutangPt > 0
                          ? 'text-emerald-800'
                          : selectedSelisihPiutangMitra > 0
                            ? 'text-rose-800'
                            : 'text-zinc-800'
                      }`}
                    >
                      {selectedSelisihHutangPt > 0
                        ? `HUTANG ${formatRupiah(selectedSelisihHutangPt)}`
                        : selectedSelisihPiutangMitra > 0
                          ? `PIUTANG ${formatRupiah(selectedSelisihPiutangMitra)}`
                          : 'IMPAS (Rp 0)'}
                    </span>
                  </div>
                </div>

                {/* Pilihan Mode Saat Mitra Memiliki Bon Aktif */}
                {selectedMitraBonAktif > 0 && selectedMitraTitipanKotor > 0 && (
                  <div className="space-y-2.5 pt-1">
                    <label className="block font-bold text-zinc-800">
                      Pilih Opsi Proses Pembayaran:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-1 bg-zinc-200/70 rounded-lg">
                      <button
                        type="button"
                        onClick={() => handleSwitchMode('AMBIL_TANPA_POTONG_BON')}
                        className={`py-2 px-2.5 rounded-md font-bold text-[11px] transition-colors cursor-pointer ${
                          modeBayar === 'AMBIL_TANPA_POTONG_BON'
                            ? 'bg-white text-emerald-900 shadow-2xs'
                            : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        Ambil Uang Dulu (Tanpa Potong Bon)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSwitchMode('KLIRING_DAN_BAYAR')}
                        className={`py-2 px-2.5 rounded-md font-bold text-[11px] transition-colors cursor-pointer ${
                          modeBayar === 'KLIRING_DAN_BAYAR'
                            ? 'bg-white text-zinc-900 shadow-2xs'
                            : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        Kliring / Angsur Bon Saat Bayar
                      </button>
                    </div>

                    {modeBayar === 'KLIRING_DAN_BAYAR' && (
                      <div className="p-3 rounded-lg bg-white border border-zinc-200 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <label className="font-bold text-zinc-800 flex items-center gap-1">
                            <ArrowRightLeft className="w-3.5 h-3.5 text-zinc-700" />
                            <span>Nominal Potong / Angsur Bon (Rp)</span>
                          </label>
                          <div className="flex flex-wrap gap-1">
                            {selectedSelisihHutangPt > 0 &&
                              selectedSelisihHutangPt < selectedPotongBonMaks && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNominalPotongBonInput(String(selectedSelisihHutangPt));
                                    setNominalInput('0');
                                  }}
                                  className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 rounded hover:bg-emerald-100 cursor-pointer"
                                >
                                  Senilai Hutang ({formatRupiahSingkat(selectedSelisihHutangPt)})
                                </button>
                              )}
                            <button
                              type="button"
                              onClick={() => {
                                setNominalPotongBonInput(String(selectedPotongBonMaks));
                                setNominalInput(
                                  String(
                                    Math.max(0, selectedMitraTitipanKotor - selectedPotongBonMaks)
                                  )
                                );
                              }}
                              className="px-2 py-0.5 text-[10px] font-bold bg-zinc-900 text-white rounded hover:bg-zinc-800 cursor-pointer"
                            >
                              Maks Kliring ({formatRupiahSingkat(selectedPotongBonMaks)})
                            </button>
                          </div>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={selectedPotongBonMaks}
                          value={nominalPotongBonInput}
                          onChange={(e) => setNominalPotongBonInput(e.target.value)}
                          className="w-full px-3 py-1.5 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold text-zinc-900"
                        />
                        <div className="text-[10px] text-zinc-500">
                          Isi nominal bon yang ingin dipotong/diangsur dari titipan. Bila mitra hanya ingin kliring tanpa ambil uang lagi, isi uang diambil = 0.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Nominal Uang Diambil / Dibayar PT ke Mitra */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                <label className="font-semibold text-zinc-700">
                  Nominal Uang Diambil Mitra (Rp)
                </label>
                {selectedMitra && batasMaksAmbilUang > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {!isKliringMode &&
                      selectedSelisihHutangPt > 0 &&
                      selectedSelisihHutangPt < batasMaksAmbilUang && (
                        <button
                          type="button"
                          onClick={() => setNominalInput(String(selectedSelisihHutangPt))}
                          className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 rounded hover:bg-emerald-100 cursor-pointer"
                        >
                          Senilai Hutang ({formatRupiahSingkat(selectedSelisihHutangPt)})
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() => setNominalInput(String(batasMaksAmbilUang))}
                      className="px-2 py-0.5 text-[10px] font-bold bg-amber-700 text-white rounded hover:bg-amber-800 cursor-pointer"
                    >
                      {isKliringMode
                        ? `Sisa Bersih (${formatRupiahSingkat(batasMaksAmbilUang)})`
                        : `Penuh Titip (${formatRupiahSingkat(batasMaksAmbilUang)})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNominalInput(String(Math.round(batasMaksAmbilUang / 2)))}
                      className="px-2 py-0.5 text-[10px] font-bold bg-white text-zinc-700 border border-zinc-300 rounded hover:bg-zinc-50 cursor-pointer"
                    >
                      50%
                    </button>
                  </div>
                )}
              </div>

              <div className="relative">
                <span className="absolute left-3 top-2.5 font-bold text-zinc-400">Rp</span>
                <input
                  type="number"
                  min={0}
                  max={batasMaksAmbilUang || 0}
                  disabled={!selectedMitraId || selectedMitraTitipanKotor <= 0}
                  value={nominalInput}
                  onChange={(e) => setNominalInput(e.target.value)}
                  placeholder="0"
                  className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-zinc-900 font-mono tabular-nums font-bold text-sm text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-400"
                />
              </div>
              {selectedMitra && selectedMitraTitipanKotor > 0 && (
                <div className="text-[11px] text-zinc-500 mt-1">
                  Maksimal uang titipan bisa diambil:{' '}
                  <strong className="font-mono text-zinc-800">
                    {formatRupiah(batasMaksAmbilUang)}
                  </strong>
                </div>
              )}
            </div>

            {/* Simulasi Posisi Akhir */}
            {selectedMitra && selectedMitraTitipanKotor > 0 && (
              <div className="p-3 rounded-xl bg-zinc-900 text-white space-y-2 text-[11px]">
                <div className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                  <Scale className="w-3.5 h-3.5 text-amber-400" />
                  <span>Simulasi Setelah Transaksi</span>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono tabular-nums">
                  <div className="bg-zinc-800 px-2.5 py-1.5 rounded border border-zinc-700 flex justify-between">
                    <span className="font-sans text-zinc-300">Sisa Piutang:</span>
                    <strong className="text-amber-300">{formatRupiah(simSisaPiutangAkhir)}</strong>
                  </div>
                  <div className="bg-zinc-800 px-2.5 py-1.5 rounded border border-zinc-700 flex justify-between">
                    <span className="font-sans text-zinc-300">Sisa Titipan:</span>
                    <strong className="text-emerald-300">{formatRupiah(simSisaTitipAkhir)}</strong>
                  </div>
                </div>
                <div className="pt-1.5 border-t border-zinc-800 flex items-center justify-between">
                  <span className="text-zinc-300">Yang Harus Dibayar Nanti:</span>
                  <strong
                    className={`font-mono tabular-nums text-xs ${
                      simNetHutangAkhir > 0
                        ? 'text-emerald-400'
                        : simNetPiutangAkhir > 0
                          ? 'text-amber-300'
                          : 'text-emerald-300'
                    }`}
                  >
                    {simNetHutangAkhir > 0
                      ? `HUTANG ${formatRupiah(simNetHutangAkhir)}`
                      : simNetPiutangAkhir > 0
                        ? `PIUTANG ${formatRupiah(simNetPiutangAkhir)}`
                        : 'IMPAS (Rp 0)'}
                  </strong>
                </div>
              </div>
            )}

            {/* Sumber Dana & Metode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Sumber Kas / Bank PT</label>
                {metode === 'SINKRON' || (parsedNominalFisik === 0 && parsedPotongBon > 0) ? (
                  <div className="w-full px-3 py-2 border border-zinc-300 bg-zinc-100 text-zinc-700 rounded-lg font-mono font-bold text-xs">
                    NON-KAS (Rp 0 Uang Keluar)
                  </div>
                ) : (
                  <select
                    value={rekeningSumber}
                    onChange={(e) => setRekeningSumber(e.target.value)}
                    disabled={!selectedMitraId || selectedMitraTitipanKotor <= 0}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-zinc-900 text-zinc-800 disabled:bg-zinc-100"
                  >
                    {rekeningList
                      .filter((r) => !r.isVirtual && r.status === 'AKTIF')
                      .map((r) => (
                        <option key={r.kode} value={r.kode}>
                          {r.nama} ({formatRupiah(r.saldoSaatIni)})
                        </option>
                      ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Metode Bayar</label>
                <select
                  value={metode}
                  onChange={(e) => setMetode(e.target.value as 'TUNAI' | 'TRANSFER' | 'SINKRON')}
                  disabled={!selectedMitraId || selectedMitraTitipanKotor <= 0}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-zinc-900 text-zinc-800 disabled:bg-zinc-100"
                >
                  <option value="TUNAI">TUNAI (Kas Kasir)</option>
                  <option value="TRANSFER">TRANSFER BANK</option>
                  <option value="SINKRON">SINKRON (Non-Kas / Rp 0 Uang Riil)</option>
                </select>
              </div>
            </div>

            {/* Tanggal & Keterangan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Tanggal Bayar
                </label>
                <input
                  type="date"
                  value={tanggalInput}
                  onChange={(e) => setTanggalInput(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-zinc-900 text-zinc-800 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Catatan / Keterangan</label>
                <input
                  type="text"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder={
                    isKliringMode
                      ? 'Cth: Angsur bon & ambil sisa panen'
                      : 'Cth: Ambil uang titipan dulu untuk modal'
                  }
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-zinc-900 text-zinc-800"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={
                submitting ||
                !selectedMitraId ||
                selectedMitraTitipanKotor <= 0 ||
                (parsedNominalFisik <= 0 && parsedPotongBon <= 0) ||
                parsedNominalFisik > batasMaksAmbilUang
              }
              className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:cursor-not-allowed mt-2"
            >
              <HandCoins className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Memproses...'
                  : parsedNominalFisik === 0 && parsedPotongBon > 0
                    ? `Proses Kliring Potong Bon (${formatRupiah(parsedPotongBon)})`
                    : isKliringMode
                      ? `Kliring Bon ${formatRupiahSingkat(parsedPotongBon)} & Bayar ${formatRupiah(parsedNominalFisik)}`
                      : `Serahkan Uang Titipan (${formatRupiah(parsedNominalFisik)})`}
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
                <span>Riwayat Pengambilan Titipan &amp; Kliring Bon Mitra</span>
              </h2>
              <p className="text-[11px] text-zinc-500">
                Histori uang titipan diambil mitra maupun potongan kliring bon
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
                        <td className="py-2.5 px-3 whitespace-nowrap text-zinc-600 font-mono tabular-nums">
                          <div>{pt.tanggal}</div>
                          <div className="text-[10px] text-zinc-400">{pt.jam}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-zinc-900 whitespace-nowrap">
                          {pt.idPencairan}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-zinc-900">
                          <div>{pt.namaMitra}</div>
                          {(pt.nominalPotongBonOtomatis || 0) > 0 ? (
                            <div className="text-[10px] text-cyan-800 font-medium">
                              Kliring potong bon {formatRupiahSingkat(pt.nominalPotongBonOtomatis || 0)}
                            </div>
                          ) : pt.keterangan ? (
                            <div className="text-[10px] text-zinc-500 font-normal truncate max-w-[200px]">
                              {pt.keterangan}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-amber-800 whitespace-nowrap">
                          {formatRupiah(pt.nominalPencairan)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-zinc-600 whitespace-nowrap">
                          {formatRupiah(pt.saldoTitipanSisa)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="text-[11px] font-medium text-zinc-700">
                            {isPotongBon
                              ? 'Kliring Potong Bon'
                              : `${pt.rekeningSumber} · ${pt.metodePembayaran}`}
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
                                    roleMitra: (() => {
                                      const foundM = mitraList.find((m) => m.id === pt.idMitra);
                                      return foundM
                                        ? getRoleMitraLabel(foundM.role, {
                                            isAnakPerusahaan: foundM.isAnakPerusahaan,
                                            isKaryawan: Boolean(foundM.idKaryawanTerkait),
                                          })
                                        : 'Supplier dan Customer';
                                    })(),
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
                                              label: 'Kliring Potong Bon',
                                              value: `- ${formatRupiah(pt.nominalPotongBonOtomatis)}`,
                                            },
                                          ]
                                        : []),
                                      {
                                        label: 'Metode Bayar',
                                        value: `${pt.metodePembayaran} (${pt.rekeningSumber})`,
                                      },
                                      {
                                        label: 'Nominal Transaksi',
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
                                        nama:
                                          pt.keterangan ||
                                          'Pembayaran Titipan Hasil Bumi dari PT ke Mitra',
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
