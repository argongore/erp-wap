import React from 'react';
import {
  AlertTriangle,
  UserCheck,
  Phone,
  MapPin,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { Mitra } from '../../server/types.ts';
import { NameMatchResult } from '../../utils/nameSimilarity.ts';

interface FuzzyNameWarningCardProps {
  inputName: string;
  matches: NameMatchResult[];
  onSelectRegistered: (mitra: Mitra) => void;
  onApplyCorrectedName?: (correctName: string) => void;
  onDismissDifferentPerson?: () => void;
  isDismissed?: boolean;
  contextLabel?: string;
  theme?: 'dark' | 'light';
}

const FuzzyNameWarningCardInner: React.FC<FuzzyNameWarningCardProps> = ({
  inputName,
  matches,
  onSelectRegistered,
  onApplyCorrectedName,
  onDismissDifferentPerson,
  isDismissed = false,
  contextLabel = 'Pihak Terkait',
  theme = 'dark',
}) => {
  if (!inputName || inputName.trim().length < 2 || matches.length === 0 || isDismissed) {
    return null;
  }

  const hasHighRisk = matches.some(
    (m) => m.isHighRiskDuplicate || m.matchType === 'PHONETIC' || m.similarity >= 80
  );

  const roleLabel = (role: string) => {
    switch (role) {
      case 'CUSTOMER':
        return 'Customer';
      case 'MITRA_TANI':
        return 'Mitra Tani';
      case 'SUPPLIER':
        return 'Supplier';
      case 'KARYAWAN':
        return 'Karyawan';
      default:
        return 'Rekanan';
    }
  };

  const isDark = theme === 'dark';

  return (
    <div
      className={`rounded-xl border my-2.5 max-w-full ${
        hasHighRisk
          ? isDark
            ? 'bg-rose-950/40 border-rose-600/70'
            : 'bg-rose-50/90 border-rose-300'
          : isDark
          ? 'bg-amber-950/30 border-amber-600/60'
          : 'bg-amber-50/90 border-amber-300'
      }`}
    >
      {/* Header Banner */}
      <div
        className={`px-3 py-2 rounded-t-xl flex flex-wrap items-start sm:items-center justify-between gap-2 border-b ${
          hasHighRisk
            ? isDark
              ? 'bg-rose-900/60 border-rose-800/80 text-rose-200'
              : 'bg-rose-100/90 border-rose-200 text-rose-950'
            : isDark
            ? 'bg-amber-900/50 border-amber-800/70 text-amber-200'
            : 'bg-amber-100/90 border-amber-200 text-amber-950'
        }`}
      >
        <div className="flex items-start space-x-2 min-w-0 flex-1">
          {hasHighRisk ? (
            <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <h4 className="text-xs font-bold flex flex-wrap items-center gap-1.5">
              <span>
                {hasHighRisk
                  ? 'Peringatan Potensi Duplikasi Nama Mirip'
                  : 'Sugesti Nama Mitra Serupa'}
              </span>
              <span className="text-[10px] font-mono opacity-80">
                ({matches.length} ditemukan)
              </span>
            </h4>
            <p className="text-[11px] opacity-90 leading-snug mt-0.5">
              Ketikan <strong className="underline underline-offset-2">&ldquo;{inputName}&rdquo;</strong>{' '}
              {hasHighRisk
                ? 'mirip dengan akun terdaftar. Pilih akun resmi agar saldo bon/titipan tidak terpecah.'
                : 'memiliki kemiripan dengan akun yang sudah terdaftar.'}
            </p>
          </div>
        </div>

        {onDismissDifferentPerson && (
          <button
            type="button"
            onClick={onDismissDifferentPerson}
            className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold border cursor-pointer transition-colors shrink-0 ${
              isDark
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-600'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
            }`}
            title="Abaikan jika orang ini memang individu yang berbeda"
          >
            Bukan, Orang Berbeda
          </button>
        )}
      </div>

      {/* Independently Scrollable Matches List (Vertical + Horizontal Scroll Enabled!) */}
      <div className="max-h-52 overflow-y-auto overflow-x-auto overscroll-contain touch-pan-x touch-pan-y p-2.5 space-y-2">
        {matches.map((res, idx) => {
          const { mitra, similarity, highlightReason, isHighRiskDuplicate } = res;

          return (
            <div
              key={mitra.id}
              className={`min-w-[260px] p-2.5 rounded-lg border transition-colors ${
                idx === 0 && isHighRiskDuplicate
                  ? isDark
                    ? 'bg-rose-900/30 border-rose-500/80'
                    : 'bg-white border-rose-400'
                  : isDark
                  ? 'bg-zinc-900/90 border-zinc-700/80'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-1.5 text-xs">
                    <span className={`font-bold ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                      {mitra.nama}
                    </span>
                    <span
                      className={`text-[10px] font-mono ${
                        isDark ? 'text-zinc-400' : 'text-slate-500'
                      }`}
                    >
                      ({mitra.kode} · {roleLabel(mitra.role)} · {similarity}% cocok)
                    </span>
                  </div>

                  <div className="flex items-center flex-wrap gap-x-2.5 gap-y-0.5 text-[11px]">
                    <span
                      className={`font-medium ${
                        isHighRiskDuplicate
                          ? isDark
                            ? 'text-rose-300 font-semibold'
                            : 'text-rose-700 font-semibold'
                          : isDark
                          ? 'text-amber-300'
                          : 'text-amber-700'
                      }`}
                    >
                      {highlightReason}
                    </span>
                    {mitra.telepon && mitra.telepon !== '-' && (
                      <span
                        className={`inline-flex items-center space-x-1 font-mono ${
                          isDark ? 'text-zinc-400' : 'text-slate-600'
                        }`}
                      >
                        <Phone className="w-3 h-3 opacity-70" />
                        <span>{mitra.telepon}</span>
                      </span>
                    )}
                    {mitra.alamat && mitra.alamat !== '-' && (
                      <span
                        className={`inline-flex items-center space-x-1 ${
                          isDark ? 'text-zinc-400' : 'text-slate-600'
                        }`}
                      >
                        <MapPin className="w-3 h-3 opacity-70" />
                        <span>{mitra.alamat}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center flex-wrap gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectRegistered(mitra)}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors whitespace-nowrap"
                    title={`Pilih ${mitra.nama} sebagai ${contextLabel} resmi terdaftar`}
                  >
                    <UserCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Pakai Akun: {mitra.nama}</span>
                  </button>

                  {onApplyCorrectedName && (
                    <button
                      type="button"
                      onClick={() => onApplyCorrectedName(mitra.nama)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-colors whitespace-nowrap ${
                        isDark
                          ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-600'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                      }`}
                      title={`Ubah ketikan menjadi "${mitra.nama}"`}
                    >
                      <span>Samakan Nama</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={`px-3 py-1.5 rounded-b-xl text-[10px] flex items-center justify-between border-t ${
          isDark
            ? 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400'
            : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <Info className="w-3 h-3 text-emerald-600 shrink-0" />
          <span>
            Deteksi otomatis ejaan mirip (misal <strong>Wiwid ≈ Wiwit</strong>, <strong>Budi ≈ Budy</strong>). Geser daftar ke atas/bawah atau kiri/kanan bila panjang.
          </span>
        </span>
      </div>
    </div>
  );
};

export const FuzzyNameWarningCard = React.memo(FuzzyNameWarningCardInner);
