import { FRESH_LIMIT } from "./config.js";
import type { SpotifyTrack } from "./types.js";

export type Lane = "english" | "arabic" | "random";

const ARABIC_HINT =
  /[\u0600-\u06FF]|arabic|egypt|khaleeji|levant|mena|shaabi|rai\b|cairokee|tul8te|assala|namira|angham|elissa|amr diab|tamer|nancy ajram|wegz|marwan|abyusif/i;

const LATIN_LETTER = /[A-Za-z]/;
const ARABIC_LETTER = /[\u0600-\u06FF]/;

export function isArabicTrack(t: SpotifyTrack): boolean {
  const blob = `${t.name} ${t.artists.join(" ")} ${t.source}`;
  if (ARABIC_HINT.test(blob)) return true;
  if (t.source.startsWith("search:arabic")) return true;
  return false;
}

/** English-leaning: not Arabic, and has Latin letters in title/artist. */
export function isEnglishTrack(t: SpotifyTrack): boolean {
  if (isArabicTrack(t)) return false;
  const blob = `${t.name} ${t.artists.join(" ")}`;
  if (ARABIC_LETTER.test(blob)) return false;
  return LATIN_LETTER.test(blob) || t.source.startsWith("search:pop") ||
    t.source.startsWith("search:trending") ||
    t.source.startsWith("search:english");
}

function artistKey(t: SpotifyTrack): string {
  return (t.artists[0] ?? "unknown").toLowerCase();
}

function sourceWeight(source: string): number {
  if (source.startsWith("search:trending")) return 3;
  if (source.startsWith("search:english")) return 2.7;
  if (source.startsWith("search:pop")) return 2.5;
  if (source.startsWith("search:arabic")) return 2.8;
  if (source.startsWith("search:variety")) return 2.2;
  if (source.startsWith("search:random")) return 2.3;
  if (source.startsWith("artist")) return 2;
  if (source.startsWith("playlist")) return 2.4;
  if (source.startsWith("taste")) return 0.4;
  return 1;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickDiversified(
  scored: Array<{ t: SpotifyTrack; score: number }>,
  limit: number,
): SpotifyTrack[] {
  const picked: SpotifyTrack[] = [];
  const artistCounts = new Map<string, number>();

  for (const { t } of scored) {
    if (picked.length >= limit) break;
    const key = artistKey(t);
    if ((artistCounts.get(key) ?? 0) >= 2) continue;
    picked.push(t);
    artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
  }

  if (picked.length < limit) {
    const have = new Set(picked.map((p) => p.id));
    for (const { t } of scored) {
      if (picked.length >= limit) break;
      if (have.has(t.id)) continue;
      const key = artistKey(t);
      if ((artistCounts.get(key) ?? 0) >= 2) continue;
      picked.push(t);
      artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
    }
  }

  return picked;
}

/**
 * Rank candidates for one lane. `excludeIds` avoids cross-playlist duplicates.
 */
export function rankTracks(
  candidates: SpotifyTrack[],
  ownedIds: Set<string>,
  opts: {
    lane: Lane;
    limit?: number;
    excludeIds?: Set<string>;
  },
): SpotifyTrack[] {
  const limit = opts.limit ?? FRESH_LIMIT;
  const exclude = opts.excludeIds ?? new Set<string>();

  const bestById = new Map<string, SpotifyTrack>();
  for (const t of candidates) {
    if (!t.id || ownedIds.has(t.id) || exclude.has(t.id)) continue;

    if (opts.lane === "arabic" && !isArabicTrack(t)) continue;
    if (opts.lane === "english" && !isEnglishTrack(t)) continue;
    // random: allow anything not already excluded

    const prev = bestById.get(t.id);
    if (!prev || sourceWeight(t.source) > sourceWeight(prev.source)) {
      bestById.set(t.id, t);
    }
  }

  let scored = [...bestById.values()].map((t) => {
    const pop = t.popularity || 30;
    let score = pop * 0.55 + sourceWeight(t.source) * 12;
    if (opts.lane === "arabic" && isArabicTrack(t)) score += 10;
    if (opts.lane === "english" && isEnglishTrack(t)) score += 8;
    if (opts.lane === "random") {
      // Prefer variety / left-field sources; add noise for shuffle feel.
      if (t.source.startsWith("search:variety") || t.source.startsWith("search:random")) {
        score += 6;
      }
      score += Math.random() * 25;
    }
    return { t, score };
  });

  if (opts.lane === "random") {
    scored = shuffleInPlace(scored);
    // Still lightly prefer higher score after shuffle of top half
    scored.sort((a, b) => b.score - a.score);
  } else {
    scored.sort((a, b) => b.score - a.score);
  }

  return pickDiversified(scored, limit);
}
