import type { SpotifyTrack } from "./types.js";

/** Strip remaster / feat / live noise so variants collapse. */
export function normalizeTitle(input: string): string {
  let s = input.toLowerCase().normalize("NFKD");
  s = s.replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[\u0600-\u06FF]/g, (ch) => ch); // keep Arabic letters
  s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  s = s.replace(
    /\b(feat\.?|ft\.?|featuring|with|remaster(ed)?|live|version|edit|radio|explicit|clean|slowed|sped|up|tiktok|viral|instrumental|cover|remix|mix|from\s+the\s+.+)\b/gi,
    " ",
  );
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function normalizeArtist(input: string): string {
  let s = input.toLowerCase().normalize("NFKD");
  s = s.replace(/[\u0300-\u036f]/g, "");
  s = s.split(/[,&/]| feat\.? | ft\.? /i)[0] ?? s;
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Stable key: primary artist + cleaned title. */
export function trackFingerprint(t: SpotifyTrack): string {
  const title = normalizeTitle(t.name);
  const artist = normalizeArtist(t.artists[0] ?? "");
  return `${artist}::${title}`;
}

export function titleOnlyKey(t: SpotifyTrack): string {
  return normalizeTitle(t.name);
}

function wordSet(s: string): Set<string> {
  return new Set(s.split(" ").filter((w) => w.length > 1));
}

/** Dice coefficient on word sets (0–1). */
export function wordSimilarity(a: string, b: string): number {
  const wa = wordSet(a);
  const wb = wordSet(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return (2 * inter) / (wa.size + wb.size);
}

export type BlockIndex = {
  ids: Set<string>;
  fingerprints: Set<string>;
  titleArtistPairs: Array<{ title: string; artist: string }>;
};

export function emptyBlockIndex(): BlockIndex {
  return {
    ids: new Set(),
    fingerprints: new Set(),
    titleArtistPairs: [],
  };
}

export function addTrackToBlock(index: BlockIndex, t: SpotifyTrack): void {
  if (!t.id) return;
  index.ids.add(t.id);
  const fp = trackFingerprint(t);
  if (fp !== "::") index.fingerprints.add(fp);
  index.titleArtistPairs.push({
    title: normalizeTitle(t.name),
    artist: normalizeArtist(t.artists[0] ?? ""),
  });
}

export function addTracksToBlock(
  index: BlockIndex,
  tracks: SpotifyTrack[],
): void {
  for (const t of tracks) addTrackToBlock(index, t);
}

/**
 * True if this track is the same or too similar to something already blocked/picked.
 */
export function isBlockedOrSimilar(
  t: SpotifyTrack,
  block: BlockIndex,
  opts: { titleSimThreshold?: number } = {},
): string | null {
  const threshold = opts.titleSimThreshold ?? 0.82;
  if (block.ids.has(t.id)) return `id:${t.id}`;

  const fp = trackFingerprint(t);
  if (fp !== "::" && block.fingerprints.has(fp)) return `fingerprint:${fp}`;

  const title = normalizeTitle(t.name);
  const artist = normalizeArtist(t.artists[0] ?? "");
  if (!title) return "empty-title";

  for (const prev of block.titleArtistPairs) {
    // Same primary artist + very similar title → treat as duplicate/variant
    if (artist && prev.artist && artist === prev.artist) {
      if (title === prev.title) return `same-artist-title:${artist}`;
      if (wordSimilarity(title, prev.title) >= threshold) {
        return `similar-title:${artist}:${title}~${prev.title}`;
      }
    }
    // Exact same cleaned title already used (any artist) — skip covers/clones
    if (title.length >= 4 && title === prev.title) {
      return `title-taken:${title}`;
    }
  }

  return null;
}
