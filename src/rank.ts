import { FRESH_LIMIT } from "./config.js";
import type { SpotifyTrack } from "./types.js";

const ARABIC_HINT =
  /[\u0600-\u06FF]|arabic|egypt|khaleeji|levant|mena|shaabi|rai\b/i;

function artistKey(t: SpotifyTrack): string {
  return (t.artists[0] ?? "unknown").toLowerCase();
}

function sourceWeight(source: string): number {
  if (source.startsWith("search:trending")) return 3;
  if (source.startsWith("search:pop")) return 2.5;
  if (source.startsWith("search:arabic")) return 2.8;
  if (source.startsWith("search:variety")) return 2.2;
  if (source.startsWith("artist")) return 2;
  if (source.startsWith("playlist")) return 2.4;
  if (source.startsWith("taste")) return 0.4; // prefer NEW over already-loved
  return 1;
}

/**
 * Drop owned tracks, diversify artists, soft language mix, keep ~40.
 */
export function rankTracks(
  candidates: SpotifyTrack[],
  ownedIds: Set<string>,
  limit = FRESH_LIMIT,
): SpotifyTrack[] {
  const bestById = new Map<string, SpotifyTrack>();
  for (const t of candidates) {
    if (!t.id || ownedIds.has(t.id)) continue;
    const prev = bestById.get(t.id);
    if (!prev || sourceWeight(t.source) > sourceWeight(prev.source)) {
      bestById.set(t.id, t);
    }
  }

  const unique = [...bestById.values()].map((t) => {
    const pop = t.popularity || 30;
    const arabicBonus = ARABIC_HINT.test(
      `${t.name} ${t.artists.join(" ")} ${t.source}`,
    )
      ? 8
      : 0;
    const score = pop * 0.55 + sourceWeight(t.source) * 12 + arabicBonus;
    return { t, score };
  });

  unique.sort((a, b) => b.score - a.score);

  const picked: SpotifyTrack[] = [];
  const artistCounts = new Map<string, number>();
  let arabic = 0;
  let other = 0;

  for (const { t } of unique) {
    if (picked.length >= limit) break;
    const key = artistKey(t);
    if ((artistCounts.get(key) ?? 0) >= 2) continue;

    const isArabic = ARABIC_HINT.test(`${t.name} ${t.artists.join(" ")} ${t.source}`);
    // Soft mix: keep roughly 35–55% Arabic-leaning when available.
    if (isArabic && arabic >= Math.ceil(limit * 0.55) && other < arabic) {
      continue;
    }
    if (!isArabic && other >= Math.ceil(limit * 0.7) && arabic < other * 0.4) {
      // Still allow if we don't have enough arabic candidates later — skip soft for now
    }

    picked.push(t);
    artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
    if (isArabic) arabic++;
    else other++;
  }

  // Fill remaining if mix rules left gaps.
  if (picked.length < limit) {
    const have = new Set(picked.map((p) => p.id));
    for (const { t } of unique) {
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
