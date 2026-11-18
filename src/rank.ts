import { FRESH_LIMIT } from "./config.js";
import {
  addTrackToBlock,
  emptyBlockIndex,
  isBlockedOrSimilar,
  type BlockIndex,
} from "./dedupe.js";
import type { SpotifyTrack } from "./types.js";

export type Lane = "english" | "arabic" | "random";

const ARABIC_HINT =
  /[\u0600-\u06FF]|arabic|egypt|khaleeji|levant|mena|shaabi|rai\b|cairokee|tul8te|assala|namira|angham|elissa|amr diab|tamer|nancy ajram|wegz|marwan|abyusif/i;

const LATIN_LETTER = /[A-Za-z]/;
const ARABIC_LETTER = /[\u0600-\u06FF]/;

/** Spam / clone-farm artists that create fake “chart” duplicates. */
const BLOCKED_ARTISTS =
  /chartwave collective|moorish science|ragal ironbull|antun karažija|dopuu|aiden music|moonshine(?!\s+band)/i;

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
  return (
    LATIN_LETTER.test(blob) ||
    t.source.startsWith("search:pop") ||
    t.source.startsWith("search:trending") ||
    t.source.startsWith("search:english")
  );
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
  if (source.startsWith("taste")) return 0.2;
  if (source.startsWith("library")) return 0;
  return 1;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isSpamArtist(t: SpotifyTrack): boolean {
  return BLOCKED_ARTISTS.test(t.artists.join(" "));
}

/**
 * Rank candidates for one lane with hard dedupe vs block index.
 * Mutates `sessionBlock` as tracks are picked (cross-list uniqueness).
 */
export function rankTracks(
  candidates: SpotifyTrack[],
  block: BlockIndex,
  opts: {
    lane: Lane;
    limit?: number;
    sessionBlock: BlockIndex;
    stats?: { skipped: number; reasons: Record<string, number> };
  },
): SpotifyTrack[] {
  const limit = opts.limit ?? FRESH_LIMIT;
  const stats = opts.stats ?? { skipped: 0, reasons: {} };
  const bumpSkip = (reason: string) => {
    stats.skipped++;
    const key = reason.split(":")[0] ?? reason;
    stats.reasons[key] = (stats.reasons[key] ?? 0) + 1;
  };

  const bestById = new Map<string, SpotifyTrack>();
  for (const t of candidates) {
    if (!t.id) continue;
    if (isSpamArtist(t)) {
      bumpSkip("spam-artist");
      continue;
    }
    if (opts.lane === "arabic" && !isArabicTrack(t)) continue;
    if (opts.lane === "english" && !isEnglishTrack(t)) continue;

    const why =
      isBlockedOrSimilar(t, block) ??
      isBlockedOrSimilar(t, opts.sessionBlock);
    if (why) {
      bumpSkip(why);
      continue;
    }

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
      if (
        t.source.startsWith("search:variety") ||
        t.source.startsWith("search:random")
      ) {
        score += 6;
      }
      score += Math.random() * 25;
    }
    return { t, score };
  });

  if (opts.lane === "random") {
    scored = shuffleInPlace(scored);
    scored.sort((a, b) => b.score - a.score);
  } else {
    scored.sort((a, b) => b.score - a.score);
  }

  const picked: SpotifyTrack[] = [];
  const artistCounts = new Map<string, number>();
  const laneBlock = emptyBlockIndex();

  const tryPick = (t: SpotifyTrack, relaxTitleTaken: boolean): boolean => {
    const whyHard =
      isBlockedOrSimilar(t, block, {
        titleSimThreshold: relaxTitleTaken ? 0.92 : 0.82,
      }) ??
      isBlockedOrSimilar(t, opts.sessionBlock, {
        titleSimThreshold: relaxTitleTaken ? 0.92 : 0.82,
      }) ??
      isBlockedOrSimilar(t, laneBlock, {
        titleSimThreshold: relaxTitleTaken ? 0.92 : 0.82,
      });

    if (whyHard) {
      // On fill pass, allow exact same title by a *different* artist (covers),
      // but never same id / fingerprint / same-artist variant.
      if (
        relaxTitleTaken &&
        whyHard.startsWith("title-taken:") &&
        !whyHard.startsWith("same-artist") &&
        !whyHard.startsWith("fingerprint") &&
        !whyHard.startsWith("id:")
      ) {
        // fall through
      } else {
        bumpSkip(whyHard);
        return false;
      }
    }

    const key = artistKey(t);
    const cap = relaxTitleTaken ? 2 : 1;
    if ((artistCounts.get(key) ?? 0) >= cap) {
      bumpSkip("artist-cap");
      return false;
    }

    picked.push(t);
    artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
    addTrackToBlock(laneBlock, t);
    addTrackToBlock(opts.sessionBlock, t);
    return true;
  };

  for (const { t } of scored) {
    if (picked.length >= limit) break;
    tryPick(t, false);
  }

  // Fill pass: still no id/fingerprint/same-artist dupes; slight artist-cap relax.
  if (picked.length < limit) {
    for (const { t } of scored) {
      if (picked.length >= limit) break;
      if (picked.some((p) => p.id === t.id)) continue;
      tryPick(t, true);
    }
  }

  return picked;
}

export { emptyBlockIndex, addTrackToBlock, addTracksToBlock } from "./dedupe.js";
export type { BlockIndex } from "./dedupe.js";
