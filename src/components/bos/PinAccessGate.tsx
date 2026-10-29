import React, { useState, useEffect, useCallback } from 'react';
import { Sprout, Lock, Delete, ArrowRight, Eye, EyeOff, ShieldCheck, Clock } from 'lucide-react';
import { api } from '../../api/client.ts';

export type AuthenticatedRole = 'BOS' | 'KASIR';

interface PinAccessGateProps {
  defaultCompanyName?: string;
  defaultBadanHukum?: string;
  preferBosHint?: boolean;
  sessionExpiredNotice?: boolean;
  onAuthenticated: (role: AuthenticatedRole, sessionDurationMs?: number) => void;
}

export const PinAccessGate: React.FC<PinAccessGateProps> = ({
  defaultCompanyName = 'PT. WIJAYA AGRO PERKASA',
  defaultBadanHukum = 'PT (Perseroan Terbatas)',
  preferBosHint = false,
  sessionExpiredNotice = false,
  onAuthenticated,
}) => {
  const [companyName, setCompanyName] = useState(defaultCompanyName);
  const [badanHukum, setBadanHukum] = useState(defaultBadanHukum);
  const [pin, setPin] = useState('');
  const [showDigits, setShowDigits] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [dbConnecting, setDbConnecting] = useState(false);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  const syncGateDatabaseStatus = useCallback(async () => {
    try {
      const res = await api.getAccessStatus();
      if (res.namaPerusahaan) setCompanyName(res.namaPerusahaan);
      if (res.badanHukum) setBadanHukum(res.badanHukum);

      if (res.supabaseConfigured) {
        setDbConnected(true);
        return;
      }

      // Auto-connect database immediately in background if Android/browser has cached cloud config or server wakes up
      setDbConnecting(true);
      const reconnectRes = await api.autoConnectCloudDatabase();
      setDbConnected(reconnectRes.configured);
      if (reconnectRes.configured) {
        const refreshed = await api.getAccessStatus().catch(() => null);
        if (refreshed?.namaPerusahaan) setCompanyName(refreshed.namaPerusahaan);
        if (refreshed?.badanHukum) setBadanHukum(refreshed.badanHukum);
      }
    } catch {
      // Retry automatically when online/visible
    } finally {
      setDbConnecting(false);
    }
  }, []);

  useEffect(() => {
    void syncGateDatabaseStatus();

    const handleResumeOrOnline = () => {
      if (document.visibilityState === 'hidden') return;
      void syncGateDatabaseStatus();
    };

    window.addEventListener('online', handleResumeOrOnline);
    window.addEventListener('pageshow', handleResumeOrOnline);
    document.addEventListener('visibilitychange', handleResumeOrOnline);
    return () => {
      window.removeEventListener('online', handleResumeOrOnline);
      window.removeEventListener('pageshow', handleResumeOrOnline);
      document.removeEventListener('visibilitychange', handleResumeOrOnline);
    };
  }, [syncGateDatabaseStatus]);

  const handleVerify = useCallback(
    async (candidatePin?: string) => {
      const targetPin = (candidatePin ?? pin).trim();
      if (targetPin.length < 4 || submitting) {
        if (targetPin.length < 4) {
          setErrorMsg('Masukkan minimal 4 digit sandi akses.');
        }
        return;
      }

      setSubmitting(true);
      setErrorMsg('');
      try {
        const res = await api.verifyAccessPin(targetPin);
        onAuthenticated(res.role, res.sessionDurationMs);
      } catch (err: any) {
        setErrorMsg(
          err.message || 'Sandi tidak sesuai. Masukkan Sandi Bos atau Sandi Admin.'
        );
        setPin('');
      } finally {
        setSubmitting(false);
      }
    },
    [pin, submitting, onAuthenticated]
  );

  const appendDigit = useCallback(
    (digit: string) => {
      if (submitting) return;
      setErrorMsg('');
      setPin((prev) => {
        if (prev.length >= 8) return prev;
        return prev + digit;
      });
    },
    [submitting]
  );

  const removeLastDigit = useCallback(() => {
    if (submitting) return;
    setErrorMsg('');
    setPin((prev) => prev.slice(0, -1));
  }, [submitting]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        appendDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        removeLastDigit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPin('');
        setErrorMsg('');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void handleVerify();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [appendDigit, removeLastDigit, handleVerify]);

  const keypadDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="bos-scroll-root h-dvh w-full overflow-y-auto overflow-x-hidden overscroll-y-contain bg-slate-50 flex flex-col justify-between px-4 py-6 sm:py-10 font-sans text-slate-900">
      <div className="w-full max-w-md mx-auto my-auto">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-7 shadow-xs">
          {/* Brand Identity */}
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
            <div className="w-11 h-11 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
              <Sprout className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 truncate">
                {companyName}
              </h1>
              <p className="text-xs text-slate-500 truncate">
                {preferBosHint
                  ? 'Portal Pantauan Pimpinan · Akses Langsung dengan Sandi'
                  : `${badanHukum} · Gerbang Sandi Sistem`}
              </p>
            </div>
          </div>

          {/* 1-Hour Session Expiry Banner */}
          {sessionExpiredNotice && (
            <div className="mt-4 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                Waktu akses sudah <strong>lebih dari 1 jam</strong>. Silakan masukkan sandi kembali untuk membuka tampilan.
              </span>
            </div>
          )}

          {/* Instruction */}
          <div className="pt-4 pb-3.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-700" />
                <span>Masukkan Sandi Akses</span>
              </label>
              <button
                type="button"
                onClick={() => setShowDigits((prev) => !prev)}
                className="min-h-8 px-2 -mr-2 text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                {showDigits ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showDigits ? 'Sembunyikan' : 'Lihat Sandi'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Masukkan <strong>Sandi Bos</strong> untuk masuk ke <strong>Tampilan Bos</strong>, atau{' '}
              <strong>Sandi Admin</strong> untuk masuk ke <strong>Tampilan Admin</strong>.
            </p>
          </div>

          {/* Sandi Display Box */}
          <div className="mb-4">
            <div
              className={`h-14 rounded-xl border px-4 flex items-center justify-center bg-slate-50/80 transition-colors ${
                errorMsg ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'
              }`}
            >
              {pin.length === 0 ? (
                <span className="text-xs text-slate-400 font-medium">
                  Ketik sandi Bos atau sandi Admin
                </span>
              ) : showDigits ? (
                <span className="font-mono text-2xl font-bold tracking-[0.35em] text-slate-900 tabular-nums">
                  {pin}
                </span>
              ) : (
                <div className="flex items-center gap-3">
                  {pin.split('').map((_, idx) => (
                    <span
                      key={idx}
                      className="w-3 h-3 rounded-full bg-emerald-700 transition-transform"
                    />
                  ))}
                </div>
              )}
            </div>

            {errorMsg && (
              <p className="mt-2 text-xs font-medium text-rose-700 text-center">{errorMsg}</p>
            )}
          </div>

          {/* Touch Numeric Keypad (52px touch targets for Android) */}
          <div className="grid grid-cols-3 gap-2.5 select-none">
            {keypadDigits.map((d) => (
              <button
                key={d}
                type="button"
                disabled={submitting}
                onClick={() => appendDigit(d)}
                className="h-13 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200/80 font-mono text-lg font-bold text-slate-900 tabular-nums transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600"
              >
                {d}
              </button>
            ))}

            <button
              type="button"
              disabled={submitting || pin.length === 0}
              onClick={() => {
                setPin('');
                setErrorMsg('');
              }}
              className="h-13 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 disabled:opacity-40 transition-colors cursor-pointer"
            >
              Ulangi
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => appendDigit('0')}
              className="h-13 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200/80 font-mono text-lg font-bold text-slate-900 tabular-nums transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600"
            >
              0
            </button>

            <button
              type="button"
              disabled={submitting || pin.length === 0}
              onClick={removeLastDigit}
              aria-label="Hapus satu digit"
              className="h-13 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Submit + 1-Hour Security Info */}
          <div className="mt-5 space-y-3">
            <button
              type="button"
              disabled={submitting || pin.length < 4}
              onClick={() => void handleVerify()}
              className="w-full h-12 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>{submitting ? 'Memverifikasi Sandi...' : 'Masuk ke Sistem'}</span>
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 text-center">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Jeda keamanan otomatis: wajib input sandi ulang setelah lebih dari 1 jam</span>
            </div>
          </div>
        </div>
      </div>

      <footer className="text-center text-xs text-slate-500 pt-5 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
        <span>
          {dbConnecting
            ? 'Menyambungkan database Cloud PostgreSQL otomatis...'
            : dbConnected
              ? 'Auto-Connect Database Cloud PostgreSQL Aktif'
              : 'Sistem Keamanan & Auto-Sync Database Terpadu'}
        </span>
      </footer>
    </div>
  );
};
