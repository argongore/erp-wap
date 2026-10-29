import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { Mitra } from '../server/types.ts';

/**
 * Advanced Indonesian Name Normalization & Fuzzy Similarity Engine
 * Specifically handles Indonesian phonetic variants, common typos, Javanese/Sundanese dialect endings,
 * and token transpositions (e.g., "Wiwid" vs "Wiwit", "Budi" vs "Budy", "Ahmad" vs "Achmad").
 *
 * Optimized with:
 * - Precomputed WeakMap cache per Mitra object (zero repeated regex/tokenization per keystroke)
 * - Zero-allocation rolling Int32Array Damerau-Levenshtein buffers with early length bailout
 * - Non-blocking React hook `useFuzzyMitraMatches` (deferred + debounced) for 60fps+ lag-free typing
 */

// Common titles / prefixes to strip for core name matching
const HONORIFIC_PREFIXES = new Set([
  'bapak',
  'bpk',
  'bp',
  'pak',
  'p.',
  'ibu',
  'ib.',
  'bu',
  'b.',
  'haji',
  'h.',
  'hj.',
  'hajjah',
  'mas',
  'mbak',
  'cak',
  'kang',
  'bang',
  'juragan',
  'bos',
  'toko',
  'warung',
  'kios',
  'ud',
  'cv',
  'pt',
]);

/**
 * Cleans and extracts core name tokens
 */
export function extractCleanTokens(rawName: string): string[] {
  if (!rawName) return [];
  const cleaned = rawName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  if (!cleaned) return [];

  return cleaned
    .split(/\s+/)
    .filter((word) => word.length > 0 && !HONORIFIC_PREFIXES.has(word));
}

/**
 * Phonetically normalizes Indonesian names:
 * - 'oe' -> 'u' (e.g. Soeharto -> Suharto)
 * - 'dj' -> 'j' (e.g. Djoko -> Joko)
 * - 'tj' -> 'c' (e.g. Tjipto -> Cipto)
 * - 'ch' -> 'k', 'kh' -> 'k' (e.g. Achmad / Akhmad -> Akmad)
 * - 'dh' -> 'd' (e.g. Ridho -> Rido, Dharma -> Darma)
 * - 'th' -> 't' (e.g. Fathir -> Fatir)
 * - 'ph' -> 'f', 'v' -> 'f'
 * - 'y' at word boundary or after vowel -> 'i' (e.g. Budy -> Budi, Sity -> Siti)
 * - Ending 'd' vs 't' equivalence (e.g. Wiwid -> Wiwit, Slamed -> Slamet, Davit -> David)
 * - Adjacent duplicate letters collapsed (e.g. Wiwwid -> Wiwid, Wiwitt -> Wiwit)
 */
export function normalizeIndonesianWord(word: string): string {
  if (!word) return '';
  let w = word.toLowerCase().trim();

  // Remove non-alphanumeric
  w = w.replace(/[^a-z0-9]/g, '');
  if (!w) return '';

  // Archaic Dutch-Indonesian spelling
  w = w
    .replace(/oe/g, 'u')
    .replace(/dj/g, 'j')
    .replace(/tj/g, 'c')
    .replace(/ch/g, 'k')
    .replace(/kh/g, 'k')
    .replace(/dh/g, 'd')
    .replace(/th/g, 't')
    .replace(/ph/g, 'f')
    .replace(/v/g, 'f')
    .replace(/y$/g, 'i')
    .replace(/d$/g, 't')
    .replace(/nk$/g, 'ng')
    .replace(/([a-z])\1+/g, '$1');

  return w;
}

// Reusable typed buffers to avoid 2D array heap allocations on every keystroke
let dlBufCap = 128;
let dlRow0 = new Int32Array(dlBufCap);
let dlRow1 = new Int32Array(dlBufCap);
let dlRow2 = new Int32Array(dlBufCap);

function ensureDlBuffers(requiredLen: number) {
  if (requiredLen <= dlBufCap) return;
  while (dlBufCap < requiredLen) {
    dlBufCap *= 2;
  }
  dlRow0 = new Int32Array(dlBufCap);
  dlRow1 = new Int32Array(dlBufCap);
  dlRow2 = new Int32Array(dlBufCap);
}

/**
 * Computes standard optimal string alignment / Damerau-Levenshtein distance
 * with zero per-call array allocations and optional maxDistance early bailout.
 */
export function damerauLevenshteinDistance(
  source: string,
  target: string,
  maxDistance?: number
): number {
  if (source === target) return 0;
  const sLen = source.length;
  const tLen = target.length;
  if (sLen === 0) return tLen;
  if (tLen === 0) return sLen;

  const lenDiff = Math.abs(sLen - tLen);
  if (maxDistance !== undefined && lenDiff > maxDistance) {
    return maxDistance + 1;
  }

  ensureDlBuffers(tLen + 1);

  let prevPrev = dlRow0;
  let prev = dlRow1;
  let curr = dlRow2;

  for (let j = 0; j <= tLen; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= sLen; i++) {
    curr[0] = i;
    const sChar = source.charCodeAt(i - 1);
    const sPrevChar = i > 1 ? source.charCodeAt(i - 2) : -1;
    let rowMin = curr[0];

    for (let j = 1; j <= tLen; j++) {
      const tChar = target.charCodeAt(j - 1);
      const cost = sChar === tChar ? 0 : 1;

      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      let val = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;

      if (
        i > 1 &&
        j > 1 &&
        sChar === target.charCodeAt(j - 2) &&
        sPrevChar === tChar
      ) {
        const trans = prevPrev[j - 2] + cost;
        if (trans < val) val = trans;
      }

      curr[j] = val;
      if (val < rowMin) rowMin = val;
    }

    if (maxDistance !== undefined && rowMin > maxDistance) {
      return maxDistance + 1;
    }

    // Rotate buffers
    const tmp = prevPrev;
    prevPrev = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[tLen];
}

export type MatchType = 'EXACT' | 'SUBSTRING' | 'PHONETIC' | 'FUZZY_TYPO';

export interface NameMatchResult {
  mitra: Mitra;
  matchType: MatchType;
  similarity: number; // 0 - 100 percentage
  distance: number;
  isHighRiskDuplicate: boolean; // Flag if this is almost certainly the same person
  matchedField: 'NAMA' | 'KODE' | 'TELEPON';
  highlightReason: string;
}

interface PrecomputedToken {
  raw: string;
  norm: string;
}

interface PrecomputedMitraInfo {
  rawNama: string;
  rawKode: string;
  rawTelepon: string;
  nameLower: string;
  kodeLower: string;
  phoneDigits: string;
  normFull: string;
  tokens: PrecomputedToken[];
}

const mitraPrecomputeCache = new WeakMap<Mitra, PrecomputedMitraInfo>();

function getPrecomputedMitra(m: Mitra): PrecomputedMitraInfo {
  const cached = mitraPrecomputeCache.get(m);
  if (
    cached &&
    cached.rawNama === m.nama &&
    cached.rawKode === m.kode &&
    cached.rawTelepon === m.telepon
  ) {
    return cached;
  }

  const nameLower = (m.nama || '').trim().toLowerCase();
  const kodeLower = (m.kode || '').trim().toLowerCase();
  const phoneDigits = (m.telepon || '').replace(/[^0-9]/g, '');
  const normFull = normalizeIndonesianWord(nameLower);
  const rawTokens = extractCleanTokens(nameLower);
  const tokens: PrecomputedToken[] = rawTokens.map((t) => ({
    raw: t,
    norm: normalizeIndonesianWord(t),
  }));

  const info: PrecomputedMitraInfo = {
    rawNama: m.nama,
    rawKode: m.kode,
    rawTelepon: m.telepon,
    nameLower,
    kodeLower,
    phoneDigits,
    normFull,
    tokens,
  };
  mitraPrecomputeCache.set(m, info);
  return info;
}

/**
 * Compares two single words and returns similarity details
 */
export function compareWords(
  w1: string,
  w2: string,
  preNorm1?: string,
  preNorm2?: string
): {
  distance: number;
  similarity: number;
  isPhoneticMatch: boolean;
} {
  const norm1 = preNorm1 !== undefined ? preNorm1 : normalizeIndonesianWord(w1);
  const norm2 = preNorm2 !== undefined ? preNorm2 : normalizeIndonesianWord(w2);

  if (norm1 === norm2 && norm1.length > 0) {
    return { distance: 0, similarity: 100, isPhoneticMatch: true };
  }

  const maxLen = Math.max(w1.length, w2.length);
  if (maxLen === 0) {
    return { distance: 0, similarity: 0, isPhoneticMatch: false };
  }

  // Max useful edit distance for >= 55% similarity or <= 2 typos
  const maxAllowedDist = Math.max(2, Math.ceil(maxLen * 0.45));
  const rawDist = damerauLevenshteinDistance(w1.toLowerCase(), w2.toLowerCase(), maxAllowedDist);
  const normDist = damerauLevenshteinDistance(norm1, norm2, maxAllowedDist);
  const bestDist = rawDist < normDist ? rawDist : normDist;

  if (bestDist > maxAllowedDist) {
    return { distance: bestDist, similarity: 0, isPhoneticMatch: false };
  }

  const similarity = Math.round((1 - bestDist / maxLen) * 100);

  return {
    distance: bestDist,
    similarity: Math.max(0, similarity),
    isPhoneticMatch: false,
  };
}

/**
 * Searches and ranks registered Mitra for similar names against an input string.
 * Specifically alerts on duplicates like 'wiwit' vs 'wiwid'.
 */
export function findSimilarMitra(
  inputName: string,
  mitraList: Mitra[],
  options?: {
    maxResults?: number;
    minSimilarity?: number; // default 65
    roleFilter?: string; // Optional role filter
  }
): NameMatchResult[] {
  const rawInput = (inputName || '').trim();
  if (rawInput.length < 2 || !Array.isArray(mitraList) || mitraList.length === 0) return [];

  const maxResults = options?.maxResults ?? 8;
  const minSim = options?.minSimilarity ?? 65;

  const inputLower = rawInput.toLowerCase();
  const inputPhoneDigits = rawInput.replace(/[^0-9]/g, '');
  const inputNormFull = normalizeIndonesianWord(inputLower);
  const inputTokens: PrecomputedToken[] = extractCleanTokens(rawInput).map((t) => ({
    raw: t,
    norm: normalizeIndonesianWord(t),
  }));

  const results: NameMatchResult[] = [];

  for (let idx = 0; idx < mitraList.length; idx++) {
    const m = mitraList[idx];
    if (!m || m.status !== 'AKTIF') continue;

    const info = getPrecomputedMitra(m);
    const mitraNameLower = info.nameLower;
    const mitraKodeLower = info.kodeLower;
    const mitraPhone = info.phoneDigits;

    // 1. Phone number match
    if (inputPhoneDigits.length >= 4 && mitraPhone.length >= 4 && mitraPhone.includes(inputPhoneDigits)) {
      results.push({
        mitra: m,
        matchType: mitraPhone === inputPhoneDigits ? 'EXACT' : 'SUBSTRING',
        similarity: 95,
        distance: 0,
        isHighRiskDuplicate: true,
        matchedField: 'TELEPON',
        highlightReason: `Nomor telepon cocok (${m.telepon})`,
      });
      continue;
    }

    // 2. Kode match
    if (mitraKodeLower === inputLower) {
      results.push({
        mitra: m,
        matchType: 'EXACT',
        similarity: 100,
        distance: 0,
        isHighRiskDuplicate: true,
        matchedField: 'KODE',
        highlightReason: `Kode ID Mitra persis cocok (${m.kode})`,
      });
      continue;
    }

    if (inputLower.length >= 3 && mitraKodeLower.includes(inputLower)) {
      results.push({
        mitra: m,
        matchType: 'SUBSTRING',
        similarity: 90,
        distance: 1,
        isHighRiskDuplicate: false,
        matchedField: 'KODE',
        highlightReason: `Kode ID mengandung kata kunci (${m.kode})`,
      });
      continue;
    }

    // 3. Exact full name match
    if (mitraNameLower === inputLower) {
      results.push({
        mitra: m,
        matchType: 'EXACT',
        similarity: 100,
        distance: 0,
        isHighRiskDuplicate: true,
        matchedField: 'NAMA',
        highlightReason: 'Nama persis sama dengan akun terdaftar',
      });
      continue;
    }

    // 4. Phonetic full match (e.g. Wiwid vs Wiwit, Ahmad vs Achmad, Budi vs Budy)
    if (info.normFull === inputNormFull && info.normFull.length > 0) {
      results.push({
        mitra: m,
        matchType: 'PHONETIC',
        similarity: 96,
        distance: damerauLevenshteinDistance(inputLower, mitraNameLower),
        isHighRiskDuplicate: true,
        matchedField: 'NAMA',
        highlightReason: `Pengucapan & fonetik identik: "${rawInput}" ≈ "${m.nama}" (variasi bunyi huruf d/t/y/kh)`,
      });
      continue;
    }

    // 5. Substring full match
    if (mitraNameLower.includes(inputLower)) {
      results.push({
        mitra: m,
        matchType: 'SUBSTRING',
        similarity: 92,
        distance: 1,
        isHighRiskDuplicate: true,
        matchedField: 'NAMA',
        highlightReason: `Nama terdaftar "${m.nama}" mengandung kata "${rawInput}"`,
      });
      continue;
    }

    if (mitraNameLower.length >= 3 && inputLower.includes(mitraNameLower)) {
      results.push({
        mitra: m,
        matchType: 'SUBSTRING',
        similarity: 90,
        distance: 1,
        isHighRiskDuplicate: true,
        matchedField: 'NAMA',
        highlightReason: `Input "${rawInput}" mengandung nama mitra "${m.nama}"`,
      });
      continue;
    }

    // 6. Token-level & Typo comparison
    let maxTokenSim = 0;
    let minTokenDist = 999;
    let isPhonetic = false;
    let matchedTokenPair = { input: '', mitra: '' };

    for (let a = 0; a < inputTokens.length; a++) {
      const inTok = inputTokens[a];
      for (let b = 0; b < info.tokens.length; b++) {
        const mTok = info.tokens[b];
        const { distance, similarity, isPhoneticMatch } = compareWords(
          inTok.raw,
          mTok.raw,
          inTok.norm,
          mTok.norm
        );

        if (similarity > maxTokenSim) {
          maxTokenSim = similarity;
          minTokenDist = distance;
          isPhonetic = isPhoneticMatch;
          matchedTokenPair = { input: inTok.raw, mitra: mTok.raw };
        }
      }
    }

    // Also check whole string Levenshtein distance with early cutoff
    const fullMaxLen = Math.max(inputLower.length, mitraNameLower.length);
    const fullMaxAllowedDist = Math.max(2, Math.ceil(fullMaxLen * (1 - minSim / 100)));
    const fullDist = damerauLevenshteinDistance(inputLower, mitraNameLower, fullMaxAllowedDist);
    const fullSim =
      fullMaxLen > 0 && fullDist <= fullMaxAllowedDist
        ? Math.round((1 - fullDist / fullMaxLen) * 100)
        : 0;

    const overallSim = Math.max(maxTokenSim, fullSim);
    const effectiveDist = Math.min(minTokenDist, fullDist);

    const isDangerousDuplicate =
      isPhonetic ||
      overallSim >= 80 ||
      (effectiveDist <= 1 && inputTokens.some((t) => t.raw.length >= 4)) ||
      (effectiveDist <= 2 && inputTokens.some((t) => t.raw.length >= 6));

    if (overallSim >= minSim || isDangerousDuplicate) {
      let reason = `Kemiripan ${overallSim}% dengan "${m.nama}"`;
      if (isPhonetic) {
        reason = `Sangat Mirip Fonetik: "${matchedTokenPair.input}" ≈ "${matchedTokenPair.mitra}" (beda ejaan suara)`;
      } else if (effectiveDist <= 1) {
        reason = `Beda tipis 1 huruf: "${rawInput}" ≈ "${m.nama}" (potensi salah ketik/orang sama)`;
      } else if (effectiveDist <= 2) {
        reason = `Beda 2 huruf: "${rawInput}" ≈ "${m.nama}"`;
      }

      results.push({
        mitra: m,
        matchType: isPhonetic ? 'PHONETIC' : 'FUZZY_TYPO',
        similarity: isPhonetic ? 94 : overallSim,
        distance: effectiveDist,
        isHighRiskDuplicate: isDangerousDuplicate,
        matchedField: 'NAMA',
        highlightReason: reason,
      });
    }
  }

  results.sort((a, b) => {
    if (a.isHighRiskDuplicate && !b.isHighRiskDuplicate) return -1;
    if (!a.isHighRiskDuplicate && b.isHighRiskDuplicate) return 1;
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    return a.distance - b.distance;
  });

  return results.slice(0, maxResults);
}

/**
 * Non-blocking React hook for anti-duplicate Mitra name detection.
 * Keeps text input typing 100% instant and lag-free using deferred + debounced evaluation.
 */
export function useFuzzyMitraMatches(
  inputName: string,
  mitraList: Mitra[],
  options?: {
    maxResults?: number;
    minSimilarity?: number;
    roleFilter?: string;
    debounceMs?: number;
  }
): NameMatchResult[] {
  const trimmed = (inputName || '').trim();
  const debounceMs = options?.debounceMs ?? 120;
  const [debouncedQuery, setDebouncedQuery] = useState<string>(trimmed);

  useEffect(() => {
    if (trimmed.length < 2) {
      setDebouncedQuery('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedQuery(trimmed);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [trimmed, debounceMs]);

  const deferredQuery = useDeferredValue(debouncedQuery);

  return useMemo(() => {
    if (!deferredQuery || deferredQuery.length < 2) return [];
    return findSimilarMitra(deferredQuery, mitraList, {
      maxResults: options?.maxResults,
      minSimilarity: options?.minSimilarity,
      roleFilter: options?.roleFilter,
    });
  }, [
    deferredQuery,
    mitraList,
    options?.maxResults,
    options?.minSimilarity,
    options?.roleFilter,
  ]);
}
