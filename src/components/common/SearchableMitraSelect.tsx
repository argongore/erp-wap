import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X, User } from 'lucide-react';
import type { Mitra } from '../../server/types.ts';

interface SearchableMitraSelectProps {
  mitras: Mitra[];
  value: string;
  onChange: (mitraId: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  accent?: 'emerald' | 'rose' | 'amber' | 'indigo' | 'teal';
  showRolePrefix?: boolean;
  getRoleLabel?: (mitra: Mitra) => string;
  getSubLabel?: (mitra: Mitra) => string;
  className?: string;
}

export const SearchableMitraSelect: React.FC<SearchableMitraSelectProps> = ({
  mitras,
  value,
  onChange,
  placeholder = 'Pilih mitra...',
  searchPlaceholder = 'Ketik nama mitra, kode, atau no HP...',
  accent = 'emerald',
  showRolePrefix = false,
  getRoleLabel,
  getSubLabel,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedMitra = useMemo(
    () => mitras.find((m) => m.id === value) || null,
    [mitras, value]
  );

  const resolveRoleText = (m: Mitra): string =>
    getRoleLabel ? getRoleLabel(m) : m.role || '';

  const filteredMitras = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mitras;
    return mitras.filter((m) => {
      const roleText = getRoleLabel ? getRoleLabel(m) : m.role || '';
      const haystack = `${m.nama || ''} ${m.kode || ''} ${m.role || ''} ${roleText} ${m.telepon || ''} ${m.alamat || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [mitras, query, getRoleLabel]);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
      return () => clearTimeout(timer);
    } else {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  useEffect(() => {
    if (activeIndex >= filteredMitras.length) {
      setActiveIndex(0);
    }
  }, [filteredMitras.length, activeIndex]);

  const accentStyles =
    accent === 'rose'
      ? {
          ring: 'focus:ring-rose-500 border-rose-500',
          selectedBg: 'bg-rose-50 text-rose-900',
          hoverBg: 'bg-rose-50/70',
          check: 'text-rose-600',
          badge: 'bg-rose-100 text-rose-800',
        }
      : accent === 'amber'
      ? {
          ring: 'focus:ring-amber-500 border-amber-500',
          selectedBg: 'bg-amber-50 text-amber-950',
          hoverBg: 'bg-amber-50/70',
          check: 'text-amber-600',
          badge: 'bg-amber-100 text-amber-900',
        }
      : accent === 'indigo'
      ? {
          ring: 'focus:ring-indigo-500 border-indigo-500',
          selectedBg: 'bg-indigo-50 text-indigo-950',
          hoverBg: 'bg-indigo-50/70',
          check: 'text-indigo-600',
          badge: 'bg-indigo-100 text-indigo-800',
        }
      : accent === 'teal'
      ? {
          ring: 'focus:ring-teal-500 border-teal-500',
          selectedBg: 'bg-teal-50 text-teal-950',
          hoverBg: 'bg-teal-50/70',
          check: 'text-teal-600',
          badge: 'bg-teal-100 text-teal-800',
        }
      : {
          ring: 'focus:ring-emerald-500 border-emerald-500',
          selectedBg: 'bg-emerald-50 text-emerald-950',
          hoverBg: 'bg-emerald-50/70',
          check: 'text-emerald-600',
          badge: 'bg-emerald-100 text-emerald-800',
        };

  const handleSelect = (mitraId: string) => {
    onChange(mitraId);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (filteredMitras.length > 0 ? (prev + 1) % filteredMitras.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        filteredMitras.length > 0 ? (prev - 1 + filteredMitras.length) % filteredMitras.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredMitras[activeIndex]) {
        handleSelect(filteredMitras[activeIndex].id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full bg-zinc-50 hover:bg-white border rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-zinc-900 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
          open ? `ring-2 ${accentStyles.ring} bg-white` : 'border-zinc-300'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {selectedMitra ? (
            <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          ) : (
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          )}
          {selectedMitra ? (
            <span className="truncate">
              {showRolePrefix && selectedMitra.role === 'KARYAWAN' ? '[KARYAWAN] ' : ''}
              {selectedMitra.nama}{' '}
              <span className="font-mono font-normal text-zinc-500">({selectedMitra.kode})</span>
              {getSubLabel && getSubLabel(selectedMitra) && (
                <span className="font-mono font-normal text-zinc-600">
                  {' '}
                  — {getSubLabel(selectedMitra)}
                </span>
              )}
            </span>
          ) : (
            <span className="text-zinc-400 font-normal truncate">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-200/80 text-zinc-600 text-[10px] font-semibold">
            <Search className="w-2.5 h-2.5" />
            <span>Cari</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-150 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in duration-100">
          {/* Search Input Header */}
          <div className="p-2 border-b border-zinc-200 bg-zinc-50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-zinc-300 rounded-lg text-xs text-zinc-900 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                  title="Bersihkan pencarian"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="mt-1 px-0.5 flex items-center justify-between text-[10px] text-zinc-500">
              <span>
                Menampilkan <strong>{filteredMitras.length}</strong> dari {mitras.length} mitra
              </span>
              <span className="font-mono text-[9.5px] text-zinc-400">Enter untuk pilih</span>
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-zinc-100">
            {filteredMitras.length === 0 ? (
              <div className="py-6 px-3 text-center text-xs text-zinc-400">
                Mitra <strong className="text-zinc-600">"{query}"</strong> tidak ditemukan.
              </div>
            ) : (
              filteredMitras.map((m, idx) => {
                const isSelected = m.id === value;
                const isHighlighted = idx === activeIndex;
                return (
                  <button
                    key={`${m.id}-${m.kode}`}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleSelect(m.id)}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? accentStyles.selectedBg
                        : isHighlighted
                        ? accentStyles.hoverBg
                        : 'bg-white hover:bg-zinc-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-zinc-900 truncate flex items-center gap-1.5">
                        <span className="truncate">
                          {showRolePrefix && m.role === 'KARYAWAN' ? '[KARYAWAN] ' : ''}
                          {m.nama}
                        </span>
                        <span className="font-mono text-[10px] font-medium text-zinc-500 shrink-0">
                          {m.kode}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-500 flex items-center gap-2 mt-0.5 truncate">
                        <span className={`px-1.5 py-0.2 rounded font-semibold text-[9.5px] shrink-0 ${accentStyles.badge}`}>
                          {resolveRoleText(m)}
                        </span>
                        {m.telepon && <span className="font-mono shrink-0">{m.telepon}</span>}
                      </div>
                      {getSubLabel && getSubLabel(m) && (
                        <div className="text-[10.5px] font-mono font-semibold text-amber-900 mt-0.5 truncate">
                          {getSubLabel(m)}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check className={`w-4 h-4 shrink-0 ${accentStyles.check}`} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
