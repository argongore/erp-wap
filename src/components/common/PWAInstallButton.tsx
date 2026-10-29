import React, { useEffect, useState } from 'react';
import { Download, Smartphone, Share, ExternalLink, X, Check } from 'lucide-react';
import { DEFAULT_PT_LOGO_URL } from '../../server/types.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isInIframe,
    install,
  };
}

interface PWAInstallButtonProps {
  variant?: 'gate' | 'header' | 'bos';
  companyName?: string;
  logoUrl?: string;
  fullViewUrl?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  companyName = 'PT. WIJAYA AGRO PERKASA',
  logoUrl = DEFAULT_PT_LOGO_URL,
  fullViewUrl,
}) => {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Automatically suppress button once running as an installed standalone home-screen shortcut
  if (isInstalled) {
    return null;
  }

  const resolvedFullUrl =
    fullViewUrl ||
    (typeof window !== 'undefined' && window.location.origin.includes('.run.app')
      ? window.location.origin
      : 'https://ais-pre-ynez6daz23cz4wbfcoqdvf-293331351835.asia-southeast1.run.app');

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuideModal(true);
      }
      return;
    }
    setShowGuideModal(true);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(resolvedFullUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  return (
    <>
      {variant === 'gate' ? (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="w-full min-h-11 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            {isInstallable
              ? 'Pasang Pintasan Aplikasi PT di Layar Utama'
              : 'Buat Pintasan Aplikasi PT (Chrome / HP)'}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-semibold transition-colors cursor-pointer shrink-0"
          title="Pasang pintasan aplikasi berikon PT. Wijaya Agro Perkasa ke Layar Utama HP / Desktop"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <span className="hidden md:inline">
            {isInstallable ? 'Pasang Aplikasi' : 'Pintasan App'}
          </span>
        </button>
      )}

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-left font-sans text-slate-900">
            <div className="p-4 sm:p-5 bg-slate-950 text-white flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3 min-w-0">
                <img
                  src={logoUrl || DEFAULT_PT_LOGO_URL}
                  alt={companyName}
                  className="w-11 h-11 rounded-xl bg-black object-contain border border-white/15 shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold truncate">
                    Pintasan Aplikasi Resmi PT
                  </h3>
                  <p className="text-xs text-slate-300 truncate">
                    Ikon layar utama: {companyName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer shrink-0"
                aria-label="Tutup panduan pintasan"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* App Shortcut Icon Preview */}
              <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <img
                  src="/pwa-192x192.png"
                  alt="Ikon Pintasan Wijaya Agro"
                  className="w-14 h-14 rounded-2xl bg-black object-contain shadow-xs shrink-0"
                />
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900">Wijaya Agro</div>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    Saat dipasang dari Chrome / Safari, aplikasi muncul di layar HP seperti aplikasi asli dengan logo resmi PT.
                  </p>
                </div>
              </div>

              {isInstallable && (
                <button
                  type="button"
                  onClick={() => void install()}
                  className="w-full min-h-11 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Pasang Pintasan Sekarang (Otomatis)</span>
                </button>
              )}

              {isInIframe && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2.5">
                  <p className="text-emerald-950 font-medium leading-relaxed">
                    Buka dulu link aplikasi di <strong>Tab Penuh Chrome</strong> agar tombol <strong>Instal Aplikasi / Tambahkan ke Layar Utama</strong> aktif di HP atau Laptop Anda:
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={resolvedFullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Buka di Chrome Penuh</span>
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-emerald-200 text-emerald-900 font-semibold transition-colors cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5" /> : null}
                      <span>{copiedLink ? 'Link Tersalin' : 'Salin Link Chrome'}</span>
                    </button>
                  </div>
                </div>
              )}

              {isIOS ? (
                <div className="space-y-2 text-slate-700 leading-relaxed">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Share className="w-4 h-4 text-emerald-700" />
                    <span>Cara Pasang di iPhone / iPad (Safari):</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 pl-0.5">
                    <li>
                      Ketuk tombol <strong>Bagikan (Share)</strong> di bagian bawah browser Safari.
                    </li>
                    <li>
                      Gulir ke bawah lalu pilih <strong>Tambah ke Layar Utama (Add to Home Screen)</strong>.
                    </li>
                    <li>
                      Ketuk <strong>Tambah</strong> — ikon resmi <strong>Wijaya Agro</strong> siap dibuka kapan saja.
                    </li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-2 text-slate-700 leading-relaxed">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-emerald-700" />
                    <span>Cara Pasang Pintasan di Chrome (Android &amp; Laptop):</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 pl-0.5">
                    <li>
                      Buka aplikasi ini langsung di browser <strong>Google Chrome</strong>.
                    </li>
                    <li>
                      Ketuk ikon <strong>titik tiga (⋮)</strong> di pojok kanan atas Chrome.
                    </li>
                    <li>
                      Pilih <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.
                    </li>
                  </ol>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-full min-h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition-colors cursor-pointer"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
