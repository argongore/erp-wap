import React, { useState } from 'react';
import {
  Building2,
  Warehouse,
  Truck,
  Wrench,
  Store,
  Sparkles,
  Layers,
} from 'lucide-react';
import {
  DEFAULT_PT_LOGO_URL,
  ItemDivisi,
  PergerakanKeuanganDivisiSummary,
} from '../../server/types.ts';

export function resolveDivisiLogoUrl(
  namaDivisi?: string,
  explicitLogoUrl?: string,
  divisiList?: Array<Pick<ItemDivisi, 'nama' | 'logoUrl'> | Pick<PergerakanKeuanganDivisiSummary, 'divisi' | 'logoUrl'>>
): string | undefined {
  if (explicitLogoUrl && explicitLogoUrl.trim()) {
    return explicitLogoUrl.trim();
  }
  const cleanName = (namaDivisi || '').trim().toLowerCase();
  if (divisiList && cleanName) {
    for (const item of divisiList) {
      const candidateName = 'nama' in item ? item.nama : item.divisi;
      if (candidateName && candidateName.trim().toLowerCase() === cleanName && item.logoUrl) {
        return item.logoUrl;
      }
    }
  }
  if (cleanName === 'pt wijaya agro perkasa' || cleanName === 'pt. wijaya agro perkasa') {
    return DEFAULT_PT_LOGO_URL;
  }
  return undefined;
}

interface DivisiLogoAvatarProps {
  namaDivisi: string;
  logoUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  theme?: 'light' | 'dark';
  className?: string;
}

export const DivisiLogoAvatar: React.FC<DivisiLogoAvatarProps> = ({
  namaDivisi,
  logoUrl,
  size = 'md',
  theme = 'light',
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const resolvedUrl = resolveDivisiLogoUrl(namaDivisi, logoUrl);

  const sizeClass =
    size === 'xs'
      ? 'w-5 h-5 rounded-md'
      : size === 'sm'
      ? 'w-8 h-8 rounded-lg'
      : size === 'lg'
      ? 'w-14 h-14 rounded-2xl'
      : 'w-10 h-10 rounded-xl';

  const iconClass =
    size === 'xs'
      ? 'w-3 h-3'
      : size === 'sm'
      ? 'w-4 h-4'
      : size === 'lg'
      ? 'w-6 h-6'
      : 'w-5 h-5';

  if (resolvedUrl && !imgError) {
    return (
      <img
        src={resolvedUrl}
        alt={`Logo ${namaDivisi}`}
        onError={() => setImgError(true)}
        className={`${sizeClass} object-contain bg-black border ${
          theme === 'dark' ? 'border-zinc-700' : 'border-slate-200'
        } shrink-0 ${className}`}
      />
    );
  }

  const getFallbackIcon = () => {
    switch (namaDivisi) {
      case 'Gudang Wijaya Agro':
        return <Warehouse className={`${iconClass} ${theme === 'dark' ? 'text-amber-400' : 'text-amber-700'}`} />;
      case 'Wijaya Karya':
        return <Wrench className={`${iconClass} ${theme === 'dark' ? 'text-blue-400' : 'text-blue-700'}`} />;
      case 'Wijaya Transport':
        return <Truck className={`${iconClass} ${theme === 'dark' ? 'text-indigo-400' : 'text-indigo-700'}`} />;
      case 'CV Wijaya Agro':
        return <Store className={`${iconClass} ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`} />;
      case 'PT Wijaya Agro Perkasa':
        return <Building2 className={`${iconClass} ${theme === 'dark' ? 'text-purple-400' : 'text-purple-700'}`} />;
      case 'Okussa':
        return <Sparkles className={`${iconClass} ${theme === 'dark' ? 'text-rose-400' : 'text-rose-700'}`} />;
      default:
        return <Layers className={`${iconClass} ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-600'}`} />;
    }
  };

  return (
    <div
      className={`${sizeClass} flex items-center justify-center shrink-0 border ${
        theme === 'dark'
          ? 'bg-zinc-800 border-zinc-700'
          : 'bg-slate-100 border-slate-200'
      } ${className}`}
    >
      {getFallbackIcon()}
    </div>
  );
};
