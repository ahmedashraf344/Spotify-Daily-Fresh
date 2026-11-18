import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { BLOCK_HISTORY_DAYS, BLOCK_HISTORY_PATH } from "./config.js";
import {
  addTrackToBlock,
  emptyBlockIndex,
  normalizeArtist,
  normalizeTitle,
  type BlockIndex,
} from "./dedupe.js";
import type { RefreshSummary, SpotifyTrack } from "./types.js";

type HistoryFile = {
  days: Array<{
    date: string;
    ids: string[];
    fingerprints: string[];
  }>;
};

function loadHistory(): HistoryFile {
  if (!existsSync(BLOCK_HISTORY_PATH)) return { days: [] };
  try {
    return JSON.parse(readFileSync(BLOCK_HISTORY_PATH, "utf8")) as HistoryFile;
  } catch {
    return { days: [] };
  }
}

/** Merge last N refresh days into a block index. */
export function blockFromHistory(): BlockIndex {
  const hist = loadHistory();
  const block = emptyBlockIndex();
  const keep = hist.days.slice(-BLOCK_HISTORY_DAYS);
  for (const day of keep) {
    for (const id of day.ids ?? []) block.ids.add(id);
    for (const fp of day.fingerprints ?? []) block.fingerprints.add(fp);
  }
  return block;
}

export function appendHistory(summary: RefreshSummary): void {
  const hist = loadHistory();
  const ids: string[] = [];
  const fingerprints: string[] = [];
  for (const p of summary.playlists ?? []) {
    for (const t of p.tracks) {
      ids.push(t.id);
      const artist = normalizeArtist(t.artists.split(",")[0] ?? "");
      const title = normalizeTitle(t.name);
      if (artist || title) fingerprints.push(`${artist}::${title}`);
    }
  }
  hist.days = [
    ...hist.days.filter((d) => d.date !== summary.date),
    { date: summary.date, ids, fingerprints },
  ].slice(-BLOCK_HISTORY_DAYS);

  mkdirSync(dirname(BLOCK_HISTORY_PATH), { recursive: true });
  writeFileSync(BLOCK_HISTORY_PATH, JSON.stringify(hist, null, 2));
}

export function mergeBlock(into: BlockIndex, tracks: SpotifyTrack[]): void {
  for (const t of tracks) addTrackToBlock(into, t);
}
