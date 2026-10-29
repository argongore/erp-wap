import React, { useState, useEffect, useCallback } from 'react';
import { Sprout, Lock, Delete, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client.ts';

export type AuthenticatedRole = 'BOS' | 'KASIR';

interface PinAccessGateProps {
  defaultCompanyName?: string;
  defaultBadanHukum?: string;
  preferBosHint?: boolean;
  onAuthenticated: (role: AuthenticatedRole, rememberDevice: boolean) => void;
}

export const PinAccessGate: React.FC<PinAccessGateProps> = ({
  defaultCompanyName = 'PT. WIJAYA AGRO PERKASA',
  defaultBadanHukum = 'PT (Perseroan Terbatas)',
  preferBosHint = false,
  onAuthenticated,
}) => {
  const [companyName, setCompanyName] = useState(defaultCompanyName);
  const [badanHukum, setBadanHukum] = useState(defaultBadanHukum);
  const [pin, setPin] = useState('');
  const [showDigits, setShowDigits] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let active = true;
    api
      .getAccessStatus()
      .then((res) => {
        if (!active) return;
        if (res.namaPerusahaan) setCompanyName(res.namaPerusahaan);
        if (res.badanHukum) setBadanHukum(res.badanHukum);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleVerify = useCallback(
    async (candidatePin?: string) => {
      const targetPin = (candidatePin ?? pin).trim();
      if (targetPin.length < 4 || submitting) {
        if (targetPin.length < 4) {
          setErrorMsg('Masukkan minimal 4 angka kode PIN.');
        }
        return;
      }

      setSubmitting(true);
      setErrorMsg('');
      try {
        const res = await api.verifyAccessPin(targetPin);
        onAuthenticated(res.role, rememberDevice);
      } catch (err: any) {
        setErrorMsg(err.message || 'Kode PIN tidak sesuai.');
        setPin('');
      } finally {
        setSubmitting(false);
      }
    },
    [pin, submitting, rememberDevice, onAuthenticated]
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
    <div className="min-h-screen w-full bg-slate-50 flex flex-col justify-between px-4 py-8 sm:py-12 font-sans text-slate-900">
      <div className="w-full max-w-md mx-auto my-auto">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xs">
          {/* Brand Identity */}
          <div className="flex items-center space-x-3 pb-5 border-b border-slate-100">
            <div className="w-11 h-11 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
              <Sprout className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 truncate">
                {companyName}
              </h1>
              <p className="text-xs text-slate-500 truncate">
                {preferBosHint
                  ? 'Portal Pantauan Pimpinan · Akses Tanpa Akun Email'
                  : `${badanHukum} · Gerbang Keamanan Sistem`}
              </p>
            </div>
          </div>

          {/* Instruction */}
          <div className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-700" />
                <span>Masukkan Kode PIN Akses</span>
              </label>
              <button
                type="button"
                onClick={() => setShowDigits((prev) => !prev)}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                {showDigits ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showDigits ? 'Sembunyikan' : 'Lihat Angka'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Ketik <strong>PIN Pimpinan (Bos)</strong> untuk membuka layar pantau eksekutif, atau{' '}
              <strong>PIN Kasir</strong> untuk menu operasional.
            </p>
          </div>

          {/* PIN Display Box */}
          <div className="mb-4">
            <div
              className={`h-14 rounded-xl border px-4 flex items-center justify-center bg-slate-50/80 transition-colors ${
                errorMsg ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'
              }`}
            >
              {pin.length === 0 ? (
                <span className="text-xs text-slate-400 font-medium">
                  Ketik 4 – 8 digit angka PIN
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

          {/* Touch Numeric Keypad (48px+ touch targets for mobile phones) */}
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
              aria-label="Hapus satu angka"
              className="h-13 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Remember Device + Submit */}
          <div className="mt-5 space-y-3.5">
            <label className="flex items-center gap-2.5 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
              />
              <span>Ingat perangkat HP/Laptop ini selama 7 hari</span>
            </label>

            <button
              type="button"
              disabled={submitting || pin.length < 4}
              onClick={() => void handleVerify()}
              className="w-full h-12 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>{submitting ? 'Memeriksa PIN...' : 'Buka Sistem Sekarang'}</span>
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <footer className="text-center text-xs text-slate-400 pt-6 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
        <span>Tersinkron langsung ke database utama Cloud PostgreSQL</span>
      </footer>
    </div>
  );
};
