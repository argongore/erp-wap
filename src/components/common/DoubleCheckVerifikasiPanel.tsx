import React, { useEffect, useState, useMemo } from 'react';
import {
  ShieldCheck,
  Wallet,
  Building2,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { Rekening } from '../../server/types.ts';
import { api } from '../../api/client.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';

export const DEFAULT_DIVISI_LIST: string[] = [
  'Gudang Wijaya Agro',
  'CV Wijaya Agro',
  'PT Wijaya Agro Perkasa',
  'Okussa',
  'Wijaya Karya',
  'Wijaya Transport',
  'BRILink',
];

const DIVISI_KODE_MAP: Record<string, string> = {
  'gudang wijaya agro': 'REK-GWA',
  'wijaya karya': 'REK-WK',
  'wijaya transport': 'REK-WT',
  'cv wijaya agro': 'REK-CVA',
  'pt wijaya agro perkasa': 'REK-WAP',
  'okussa': 'REK-OKU',
  'brilink': 'REK-BRILINK',
};

/**
 * Mencari rekening buku arus kas divisi (OPERASIONAL_DIVISI) yang sesuai dengan nama divisi.
 */
export function resolveDivisiAccount(
  divisiName: string,
  rekeningList: Rekening[]
): { kode: string; nama: string; saldoSaatIni: number } {
  const cleanName = String(divisiName || '').trim();
  const norm = cleanName.toLowerCase();
  const mappedKode =
    DIVISI_KODE_MAP[norm] ||
    `REK-${cleanName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() || 'DIV'}`;

  const matched =
    rekeningList.find((r) => r.kode.toUpperCase() === mappedKode.toUpperCase()) ||
    rekeningList.find(
      (r) =>
        r.kategori === 'OPERASIONAL_DIVISI' &&
        (r.atasNama.toLowerCase() === `divisi ${norm}` ||
          r.nama.toLowerCase().includes(norm))
    );

  if (matched) {
    return {
      kode: matched.kode,
      nama: matched.nama,
      saldoSaatIni: Number(matched.saldoSaatIni) || 0,
    };
  }

  return {
    kode: mappedKode,
    nama: `Buku Arus Kas ${cleanName || 'Divisi'}`,
    saldoSaatIni: 0,
  };
}

/**
 * Filter rekening murni untuk Transfer Bank & Afiliasi Riil.
 * Mengecualikan Buku Operasional Divisi (OPERASIONAL_DIVISI) serta rekening virtual/kas tunai
 * agar kasir tidak salah memilih buku tracking divisi sebagai rekening bank fisik.
 */
export function isRealTransferBankAccount(r: Rekening): boolean {
  return (
    r.status === 'AKTIF' &&
    !r.isVirtual &&
    r.kategori !== 'OPERASIONAL_DIVISI' &&
    r.kode !== 'KAS01' &&
    r.kode !== 'BON01' &&
    r.kode !== 'TIT01' &&
    r.kode !== 'SINKRON'
  );
}

/**
 * Hook dinamis untuk mengambil daftar divisi dari API + fallback standar perusahaan.
 */
export function useDivisiOptions(): string[] {
  const [customDivisi, setCustomDivisi] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getDivisi()
      .then((list) => {
        if (!cancelled && Array.isArray(list)) {
          setCustomDivisi(list.map((d) => String(d.nama || '').trim()).filter(Boolean));
        }
      })
      .catch(() => {
        // Fallback aman ke DEFAULT_DIVISI_LIST
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const merged = new Set<string>(DEFAULT_DIVISI_LIST);
    for (const d of customDivisi) {
      if (d) merged.add(d);
    }
    return Array.from(merged);
  }, [customDivisi]);
}

export interface ArusKasDivisiSelectorCardProps {
  direction: 'MASUK' | 'KELUAR';
  metode: string;
  nominal: number;
  divisi: string;
  divisiOptions: string[];
  onChangeDivisi: (divisi: string) => void;
  rekeningList: Rekening[];
  theme?: 'dark' | 'light';
  isBelumPutusHarga?: boolean;
  onDivisiCreated?: () => void;
}

/**
 * Komponen utama pada form Penjualan & Pembelian untuk memilih Arus Kas Divisi
 * sekaligus menampilkan saldo divisi saat ini dan simulasi penambahan/pengurangan otomatisnya.
 */
export const ArusKasDivisiSelectorCard: React.FC<ArusKasDivisiSelectorCardProps> = ({
  direction,
  metode,
  nominal,
  divisi,
  divisiOptions,
  onChangeDivisi,
  rekeningList,
  theme = 'dark',
  isBelumPutusHarga = false,
  onDivisiCreated,
}) => {
  const isDark = theme === 'dark';
  const [showAddInput, setShowAddInput] = useState(false);
  const [newDivisiName, setNewDivisiName] = useState('');
  const [addingDivisi, setAddingDivisi] = useState(false);
  const [extraOptions, setExtraOptions] = useState<string[]>([]);

  const allOptions = useMemo(() => {
    const set = new Set<string>(divisiOptions);
    for (const ex of extraOptions) {
      if (ex) set.add(ex);
    }
    if (divisi) set.add(divisi);
    return Array.from(set);
  }, [divisiOptions, extraOptions, divisi]);

  const isNonTunai =
    isBelumPutusHarga ||
    metode === 'KASBON' ||
    metode === 'PIUTANG' ||
    metode === 'TITIP' ||
    metode === 'HUTANG' ||
    metode === 'INTERNAL_PT';

  const activeDivisiAcc = useMemo(
    () => resolveDivisiAccount(divisi, rekeningList),
    [divisi, rekeningList]
  );

  const deltaDivisi = isNonTunai ? 0 : direction === 'MASUK' ? nominal : -nominal;
  const estimasiSaldoDivisi = activeDivisiAcc.saldoSaatIni + deltaDivisi;

  const handleCreateNewDivisi = async () => {
    const trimmed = newDivisiName.trim();
    if (!trimmed) return;
    setAddingDivisi(true);
    try {
      const created = await api.createDivisi({ nama: trimmed });
      const finalName = created?.nama || trimmed;
      setExtraOptions((prev) => [...prev, finalName]);
      onChangeDivisi(finalName);
      setNewDivisiName('');
      setShowAddInput(false);
      onDivisiCreated?.();
    } catch {
      setExtraOptions((prev) => [...prev, trimmed]);
      onChangeDivisi(trimmed);
      setNewDivisiName('');
      setShowAddInput(false);
    } finally {
      setAddingDivisi(false);
    }
  };

  return (
    <div
      className={`rounded-xl border p-3.5 space-y-2.5 text-xs transition-all ${
        direction === 'MASUK'
          ? isDark
            ? 'bg-emerald-950/25 border-emerald-700/60'
            : 'bg-emerald-50/60 border-emerald-300'
          : isDark
          ? 'bg-sky-950/25 border-sky-800/60'
          : 'bg-sky-50/60 border-sky-300'
      }`}
    >
      {/* Header Label */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Building2
            className={`w-4 h-4 shrink-0 ${
              direction === 'MASUK'
                ? isDark
                  ? 'text-emerald-400'
                  : 'text-emerald-700'
                : isDark
                ? 'text-sky-400'
                : 'text-sky-700'
            }`}
          />
          <span
            className={`font-bold text-xs ${
              isDark ? 'text-zinc-100' : 'text-zinc-900'
            }`}
          >
            Pilih Arus Kas Divisi <span className="text-rose-500">*</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isNonTunai ? (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                isDark
                  ? 'bg-amber-950/70 text-amber-300 border-amber-800'
                  : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}
            >
              Non-Tunai (Saldo Divisi Tetap)
            </span>
          ) : direction === 'MASUK' ? (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${
                isDark
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              <span>Otomatis +Saldo Divisi</span>
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${
                isDark
                  ? 'bg-rose-950 text-rose-300 border-rose-800'
                  : 'bg-rose-100 text-rose-800 border-rose-300'
              }`}
            >
              <TrendingDown className="w-3 h-3" />
              <span>Otomatis -Saldo Divisi</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowAddInput((v) => !v)}
            className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded border cursor-pointer transition-colors ${
              isDark
                ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
                : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-300'
            }`}
            title="Tambah Divisi Baru"
          >
            <Plus className="w-3 h-3" />
            <span>Divisi Baru</span>
          </button>
        </div>
      </div>

      {/* Inline Add New Divisi */}
      {showAddInput && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={newDivisiName}
            onChange={(e) => setNewDivisiName(e.target.value)}
            placeholder="Ketik nama divisi baru (misal: Divisi Beras)..."
            className={`flex-1 px-2.5 py-1.5 rounded-lg border text-xs ${
              isDark
                ? 'bg-zinc-900 border-zinc-700 text-zinc-100 placeholder-zinc-500'
                : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
            }`}
          />
          <button
            type="button"
            disabled={!newDivisiName.trim() || addingDivisi}
            onClick={handleCreateNewDivisi}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer shrink-0"
          >
            {addingDivisi ? '...' : 'Simpan'}
          </button>
        </div>
      )}

      {/* Quick Choice Division Pills with Live Balance */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {allOptions.map((opt) => {
          const acc = resolveDivisiAccount(opt, rekeningList);
          const isSelected = opt === divisi;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChangeDivisi(opt)}
              className={`text-left p-2 rounded-lg border transition-all cursor-pointer min-w-0 ${
                isSelected
                  ? direction === 'MASUK'
                    ? isDark
                      ? 'bg-emerald-600/25 border-emerald-400 text-emerald-100 shadow-xs'
                      : 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                    : isDark
                    ? 'bg-sky-600/25 border-sky-400 text-sky-100 shadow-xs'
                    : 'bg-sky-700 text-white border-sky-800 shadow-xs'
                  : isDark
                  ? 'bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                  : 'bg-white border-zinc-200 text-zinc-800 hover:border-zinc-400'
              }`}
            >
              <div className="font-bold text-[11px] truncate">{opt}</div>
              <div
                className={`text-[10px] font-mono tabular-nums truncate mt-0.5 ${
                  isSelected
                    ? isDark
                      ? 'text-amber-300 font-semibold'
                      : 'text-emerald-100 font-semibold'
                    : isDark
                    ? 'text-zinc-400'
                    : 'text-zinc-500'
                }`}
                title={`${acc.kode}: ${formatRupiah(acc.saldoSaatIni)}`}
              >
                {acc.kode} · {formatRupiahSingkat(acc.saldoSaatIni)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Live Division Balance Mutation Preview */}
      <div
        className={`rounded-lg border p-2.5 grid grid-cols-3 gap-2 font-mono tabular-nums text-[11px] ${
          isDark
            ? 'bg-zinc-950/90 border-zinc-800'
            : 'bg-white border-zinc-200'
        }`}
      >
        <div className="min-w-0">
          <div
            className={`text-[10px] font-sans truncate ${
              isDark ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            Saldo {activeDivisiAcc.kode}
          </div>
          <div
            className={`font-semibold truncate ${
              isDark ? 'text-zinc-200' : 'text-zinc-800'
            }`}
            title={formatRupiah(activeDivisiAcc.saldoSaatIni)}
          >
            {formatRupiah(activeDivisiAcc.saldoSaatIni)}
          </div>
        </div>

        <div className="min-w-0">
          <div
            className={`text-[10px] font-sans truncate ${
              isDark ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            {isNonTunai
              ? 'Mutasi Kas Divisi'
              : direction === 'MASUK'
              ? 'Arus Masuk (+)'
              : 'Arus Keluar (-)'}
          </div>
          <div
            className={`font-bold truncate ${
              isNonTunai
                ? isDark
                  ? 'text-amber-400'
                  : 'text-amber-700'
                : direction === 'MASUK'
                ? isDark
                  ? 'text-emerald-400'
                  : 'text-emerald-700'
                : isDark
                ? 'text-rose-400'
                : 'text-rose-700'
            }`}
            title={formatRupiah(Math.abs(deltaDivisi))}
          >
            {isNonTunai
              ? 'Rp 0'
              : `${direction === 'MASUK' ? '+' : '-'}${formatRupiah(nominal)}`}
          </div>
        </div>

        <div className="min-w-0">
          <div
            className={`text-[10px] font-sans truncate ${
              isDark ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            Saldo Baru Divisi
          </div>
          <div
            className={`font-bold truncate ${
              estimasiSaldoDivisi < 0
                ? isDark
                  ? 'text-rose-400'
                  : 'text-rose-700'
                : isDark
                ? 'text-emerald-300'
                : 'text-emerald-800'
            }`}
            title={formatRupiah(estimasiSaldoDivisi)}
          >
            {formatRupiah(estimasiSaldoDivisi)}
          </div>
        </div>
      </div>

      <p
        className={`text-[10px] leading-snug ${
          isDark ? 'text-zinc-400' : 'text-zinc-600'
        }`}
      >
        {isNonTunai ? (
          <>
            Karena metode <strong>{isBelumPutusHarga ? 'BELUM PUTUS HARGA' : metode}</strong> (non-tunai), saldo arus kas divisi <strong>{divisi}</strong> belum berubah sekarang dan otomatis bertambah saat piutang dilunasi tunai/transfer.
          </>
        ) : direction === 'MASUK' ? (
          <>
            Penjualan ini menggerakkan arus kas masuk di divisi <strong>{divisi} ({activeDivisiAcc.kode})</strong> dan otomatis menambah saldo divisi tersebut sebesar <strong>+{formatRupiah(nominal)}</strong>.
          </>
        ) : (
          <>
            Pembelian ini menggerakkan arus kas keluar di divisi <strong>{divisi} ({activeDivisiAcc.kode})</strong> dan otomatis memotong saldo divisi tersebut sebesar <strong>-{formatRupiah(nominal)}</strong>.
          </>
        )}
      </p>
    </div>
  );
};

export interface DoubleCheckVerifikasiPanelProps {
  direction: 'MASUK' | 'KELUAR';
  metode: string;
  nominal: number;
  rekeningList: Rekening[];
  selectedTransferKode: string;
  onChangeTransferKode?: (kode: string) => void;
  divisi: string;
  divisiOptions: string[];
  onChangeDivisi: (divisi: string) => void;
  verified: boolean;
  onToggleVerified: (checked: boolean) => void;
  theme?: 'dark' | 'light';
  isBelumPutusHarga?: boolean;
}

export const DoubleCheckVerifikasiPanel: React.FC<DoubleCheckVerifikasiPanelProps> = ({
  direction,
  metode,
  nominal,
  rekeningList,
  selectedTransferKode,
  onChangeTransferKode,
  divisi,
  divisiOptions,
  onChangeDivisi,
  verified,
  onToggleVerified,
  theme = 'light',
  isBelumPutusHarga = false,
}) => {
  const isDark = theme === 'dark';

  const bankAccounts = useMemo(
    () => rekeningList.filter(isRealTransferBankAccount),
    [rekeningList]
  );

  const isNonTunai =
    isBelumPutusHarga ||
    metode === 'KASBON' ||
    metode === 'PIUTANG' ||
    metode === 'TITIP' ||
    metode === 'HUTANG' ||
    metode === 'INTERNAL_PT' ||
    nominal === 0;

  const activeRealAccount: Rekening | undefined = useMemo(() => {
    if (isNonTunai) return undefined;
    if (metode === 'TUNAI') {
      return rekeningList.find((r) => r.kode === 'KAS01');
    }
    if (metode === 'TRANSFER') {
      return (
        bankAccounts.find((r) => r.kode === selectedTransferKode) ||
        rekeningList.find((r) => r.kode === selectedTransferKode) ||
        bankAccounts[0]
      );
    }
    return undefined;
  }, [isNonTunai, metode, rekeningList, bankAccounts, selectedTransferKode]);

  const saldoSaatIni = Number(activeRealAccount?.saldoSaatIni) || 0;
  const estimasiSaldoAkhir =
    direction === 'MASUK' ? saldoSaatIni + nominal : saldoSaatIni - nominal;

  const activeDivisiAcc = useMemo(
    () => resolveDivisiAccount(divisi, rekeningList),
    [divisi, rekeningList]
  );
  const deltaDivisi = isNonTunai ? 0 : direction === 'MASUK' ? nominal : -nominal;
  const estimasiSaldoDivisiAkhir = activeDivisiAcc.saldoSaatIni + deltaDivisi;

  const isAnakPerusahaan = Boolean(
    activeRealAccount?.isAnakPerusahaan ||
      activeRealAccount?.kategori === 'ANAK_PERUSAHAAN' ||
      activeRealAccount?.kode === 'REK-DPPARABO'
  );

  const saldoTidakCukup =
    !isNonTunai && direction === 'KELUAR' && !isAnakPerusahaan && estimasiSaldoAkhir < 0;

  const nonTunaiLabel = useMemo(() => {
    if (isBelumPutusHarga) return 'TIT01 — Titip Timbang (Belum Putus Harga · Rp 0 Uang Keluar)';
    if (metode === 'INTERNAL_PT' || nominal === 0) {
      return 'INTERNAL_PT — Pemakaian Operasional PT (Rp 0 Uang Masuk)';
    }
    if (metode === 'KASBON' || metode === 'PIUTANG') {
      return 'BON01 — Piutang Mitra / Pabrik (Rp 0 Uang Riil Masuk)';
    }
    if (metode === 'TITIP') {
      return 'TIT01 — Saldo Titip Hasil Bumi Petani (Rp 0 Uang Riil Keluar)';
    }
    if (metode === 'HUTANG') {
      return 'TIT01 — Hutang Usaha Pemasok / Tempo (Rp 0 Uang Riil Keluar)';
    }
    return 'Pencatatan Non-Tunai (Rp 0 Uang Riil)';
  }, [isBelumPutusHarga, metode, nominal]);

  const ringkasanRekeningText = isNonTunai
    ? 'Non-Tunai (Rp 0 Uang Riil)'
    : activeRealAccount
    ? `${activeRealAccount.kode} (${activeRealAccount.nama})`
    : metode;

  const containerCls = isDark
    ? 'rounded-xl border border-amber-500/40 bg-zinc-950/90 p-3.5 space-y-3 text-xs'
    : 'rounded-xl border border-amber-300 bg-amber-50/50 p-3.5 space-y-3 text-xs';

  const cardCls = isDark
    ? 'rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-2'
    : 'rounded-lg border border-zinc-200 bg-white p-3 space-y-2';

  const selectCls = isDark
    ? 'w-full px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100 text-xs font-semibold focus:outline-none focus:border-emerald-500'
    : 'w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white text-zinc-900 text-xs font-semibold focus:outline-none focus:border-emerald-600';

  const mergedDivisiOptions = useMemo(() => {
    const s = new Set<string>(divisiOptions);
    if (divisi) s.add(divisi);
    return Array.from(s);
  }, [divisiOptions, divisi]);

  return (
    <div className={containerCls}>
      {/* Header Double-Check */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck
            className={`w-4 h-4 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}
          />
          <span
            className={`font-bold uppercase tracking-wider text-[11px] ${
              isDark ? 'text-amber-300' : 'text-amber-950'
            }`}
          >
            Double-Check Verifikasi Rekening &amp; Arus Kas Divisi
          </span>
        </div>
        <span
          className={`text-[10px] font-semibold ${
            isDark ? 'text-zinc-400' : 'text-zinc-600'
          }`}
        >
          Wajib dicek sebelum simpan
        </span>
      </div>

      {/* Poin 1: Uang Riil Masuk / Keluar Rekening Apa */}
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold">
            <Wallet
              className={`w-3.5 h-3.5 shrink-0 ${
                isNonTunai
                  ? isDark
                    ? 'text-amber-400'
                    : 'text-amber-700'
                  : direction === 'MASUK'
                  ? isDark
                    ? 'text-emerald-400'
                    : 'text-emerald-700'
                  : isDark
                  ? 'text-rose-400'
                  : 'text-rose-700'
              }`}
            />
            <span className={isDark ? 'text-zinc-200' : 'text-zinc-900'}>
              {direction === 'MASUK'
                ? '1. Uang Riil Masuk ke Rekening Fisik Apa?'
                : '1. Uang Riil Keluar dari Rekening Fisik Apa?'}
            </span>
          </div>
          {!isNonTunai && (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${
                direction === 'MASUK'
                  ? isDark
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-emerald-100 text-emerald-800'
                  : isDark
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {direction === 'MASUK' ? (
                <>
                  <ArrowDownLeft className="w-3 h-3" />
                  <span>UANG MASUK</span>
                </>
              ) : (
                <>
                  <ArrowUpRight className="w-3 h-3" />
                  <span>UANG KELUAR</span>
                </>
              )}
            </span>
          )}
        </div>

        {isNonTunai ? (
          <div
            className={`p-2.5 rounded-lg border text-[11px] space-y-1 ${
              isDark
                ? 'bg-zinc-950 border-zinc-800 text-zinc-300'
                : 'bg-zinc-50 border-zinc-200 text-zinc-700'
            }`}
          >
            <div className={`font-bold ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
              {nonTunaiLabel}
            </div>
            <p className={isDark ? 'text-zinc-400 text-[10px]' : 'text-zinc-500 text-[10px]'}>
              Tidak ada uang kas tunai maupun saldo rekening bank fisik yang berubah pada saat ini.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {metode === 'TRANSFER' && onChangeTransferKode && bankAccounts.length > 0 ? (
              <div>
                <label
                  className={`block text-[10px] font-semibold mb-1 ${
                    isDark ? 'text-zinc-400' : 'text-zinc-600'
                  }`}
                >
                  {direction === 'MASUK'
                    ? 'Pastikan Rekening Bank Penerima Uang Riil:'
                    : 'Pastikan Rekening Bank Sumber Pengeluaran:'}
                </label>
                <select
                  value={activeRealAccount?.kode || selectedTransferKode}
                  onChange={(e) => {
                    onToggleVerified(false);
                    onChangeTransferKode(e.target.value);
                  }}
                  className={selectCls}
                >
                  {bankAccounts.map((rek) => (
                    <option key={rek.kode} value={rek.kode}>
                      {rek.kode} — {rek.nama} ({formatRupiah(rek.saldoSaatIni)})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div
                className={`p-2 rounded-lg border ${
                  isDark
                    ? 'bg-zinc-950 border-zinc-800'
                    : 'bg-zinc-50 border-zinc-200'
                }`}
              >
                <div className={`font-bold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
                  {activeRealAccount
                    ? `${activeRealAccount.kode} — ${activeRealAccount.nama}`
                    : 'KAS01 — Kas Tunai Utama'}
                </div>
                {activeRealAccount && (
                  <div className={`text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    a.n. {activeRealAccount.atasNama} · {activeRealAccount.nomorRekening}
                  </div>
                )}
              </div>
            )}

            {/* Mutasi Saldo Riil Preview */}
            <div
              className={`grid grid-cols-3 gap-2 pt-1.5 border-t text-[11px] font-mono tabular-nums ${
                isDark ? 'border-zinc-800' : 'border-zinc-200'
              }`}
            >
              <div>
                <div className={`text-[10px] font-sans ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  Saldo Fisik Saat Ini
                </div>
                <div className={`font-semibold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                  {formatRupiah(saldoSaatIni)}
                </div>
              </div>
              <div>
                <div className={`text-[10px] font-sans ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {direction === 'MASUK' ? 'Uang Masuk (+)' : 'Uang Keluar (-)'}
                </div>
                <div
                  className={`font-bold ${
                    direction === 'MASUK'
                      ? isDark
                        ? 'text-emerald-400'
                        : 'text-emerald-700'
                      : isDark
                      ? 'text-rose-400'
                      : 'text-rose-700'
                  }`}
                >
                  {direction === 'MASUK' ? '+' : '-'}
                  {formatRupiah(nominal)}
                </div>
              </div>
              <div>
                <div className={`text-[10px] font-sans ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  Saldo Fisik Akhir
                </div>
                <div
                  className={`font-bold ${
                    saldoTidakCukup
                      ? isDark
                        ? 'text-rose-400'
                        : 'text-rose-700'
                      : isDark
                      ? 'text-amber-300'
                      : 'text-zinc-900'
                  }`}
                >
                  {formatRupiah(estimasiSaldoAkhir)}
                </div>
              </div>
            </div>

            {saldoTidakCukup && (
              <div
                className={`p-2 rounded-md border flex items-center gap-1.5 text-[11px] font-semibold ${
                  isDark
                    ? 'bg-rose-950/70 border-rose-800 text-rose-300'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Saldo rekening fisik tidak mencukupi untuk pengeluaran ini!</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Poin 2: Arus Kas Bergerak di Divisi Apa & Simulasi Saldo Divisi */}
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold">
            <Building2
              className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-sky-400' : 'text-sky-700'}`}
            />
            <span className={isDark ? 'text-zinc-200' : 'text-zinc-900'}>
              2. Arus Kas Bergerak di Divisi Apa?
            </span>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
              isDark
                ? 'bg-sky-950 text-sky-300 border-sky-800'
                : 'bg-sky-100 text-sky-900 border-sky-300'
            }`}
          >
            {activeDivisiAcc.kode}
          </span>
        </div>

        <select
          value={divisi}
          onChange={(e) => {
            onToggleVerified(false);
            onChangeDivisi(e.target.value);
          }}
          className={selectCls}
        >
          {mergedDivisiOptions.map((d) => {
            const dAcc = resolveDivisiAccount(d, rekeningList);
            return (
              <option key={d} value={d}>
                {d} ({dAcc.kode} — Saldo Divisi: {formatRupiah(dAcc.saldoSaatIni)})
              </option>
            );
          })}
        </select>

        {/* Mutasi Saldo Arus Kas Divisi Preview */}
        <div
          className={`grid grid-cols-3 gap-2 pt-1.5 border-t text-[11px] font-mono tabular-nums ${
            isDark ? 'border-zinc-800' : 'border-zinc-200'
          }`}
        >
          <div>
            <div className={`text-[10px] font-sans ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Saldo Divisi Saat Ini
            </div>
            <div className={`font-semibold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
              {formatRupiah(activeDivisiAcc.saldoSaatIni)}
            </div>
          </div>
          <div>
            <div className={`text-[10px] font-sans ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {isNonTunai
                ? 'Mutasi Arus Kas'
                : direction === 'MASUK'
                ? 'Arus Masuk Divisi (+)'
                : 'Arus Keluar Divisi (-)'}
            </div>
            <div
              className={`font-bold ${
                isNonTunai
                  ? isDark
                    ? 'text-amber-400'
                    : 'text-amber-700'
                  : direction === 'MASUK'
                  ? isDark
                    ? 'text-emerald-400'
                    : 'text-emerald-700'
                  : isDark
                  ? 'text-rose-400'
                  : 'text-rose-700'
              }`}
            >
              {isNonTunai
                ? 'Rp 0'
                : `${direction === 'MASUK' ? '+' : '-'}${formatRupiah(nominal)}`}
            </div>
          </div>
          <div>
            <div className={`text-[10px] font-sans ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Saldo Divisi Akhir
            </div>
            <div
              className={`font-bold ${
                estimasiSaldoDivisiAkhir < 0
                  ? isDark
                    ? 'text-rose-400'
                    : 'text-rose-700'
                  : isDark
                  ? 'text-emerald-300'
                  : 'text-emerald-800'
              }`}
            >
              {formatRupiah(estimasiSaldoDivisiAkhir)}
            </div>
          </div>
        </div>

        <p className={`text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          {isNonTunai
            ? `Dicatat pada Divisi ${divisi} (${activeDivisiAcc.kode}). Saldo arus kas divisi akan bergerak otomatis saat tagihan dilunasi tunai/transfer.`
            : direction === 'MASUK'
            ? `Otomatis menambah saldo arus kas Divisi ${divisi} (${activeDivisiAcc.kode}) sebesar +${formatRupiah(nominal)}.`
            : `Otomatis memotong saldo arus kas Divisi ${divisi} (${activeDivisiAcc.kode}) sebesar -${formatRupiah(nominal)}.`}
        </p>
      </div>

      {/* Checkbox Konfirmasi Akhir */}
      <label
        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer select-none transition-colors ${
          verified
            ? isDark
              ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200'
              : 'bg-emerald-50 border-emerald-500 text-emerald-950'
            : isDark
            ? 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:border-amber-500/70'
            : 'bg-white border-zinc-300 text-zinc-800 hover:border-amber-500'
        }`}
      >
        <input
          type="checkbox"
          checked={verified}
          disabled={saldoTidakCukup}
          onChange={(e) => onToggleVerified(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded accent-emerald-600 cursor-pointer shrink-0"
        />
        <span className="text-[11px] leading-snug font-semibold">
          Saya sudah verifikasi ulang: Rekening Fisik{' '}
          <strong className={isDark ? 'text-white' : 'text-zinc-950'}>
            {ringkasanRekeningText}
          </strong>{' '}
          &amp; Arus Kas Divisi{' '}
          <strong className={isDark ? 'text-sky-300' : 'text-sky-900'}>
            {divisi} ({activeDivisiAcc.kode})
          </strong>{' '}
          sudah sesuai.
        </span>
      </label>
    </div>
  );
};
