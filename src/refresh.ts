import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PLAYLIST_NAME, RUNS_LATEST_PATH } from "./config.js";
import { collectCandidates } from "./discover.js";
import { rankTracks } from "./rank.js";
import {
  createPlaylist,
  findPlaylistByName,
  getMe,
  getPlaylistTracks,
  getSavedTrackIds,
  replacePlaylistTracks,
  updatePlaylistDetails,
} from "./spotify.js";
import type { RefreshSummary } from "./types.js";

export async function refreshFresh40(): Promise<RefreshSummary> {
  const me = await getMe();
  console.log(`User: ${me.display_name ?? me.id}`);

  const owned = await getSavedTrackIds(20);
  console.log(`Library track ids loaded: ${owned.size}`);

  const { candidates, sourceCounts } = await collectCandidates();
  console.log(`Raw candidates: ${candidates.length}`);

  // Also treat current Fresh playlist tracks as "owned" so we rotate when possible.
  const existing = await findPlaylistByName(PLAYLIST_NAME);
  if (existing) {
    try {
      const current = await getPlaylistTracks(existing.id, "fresh-current", 50);
      for (const t of current) owned.add(t.id);
    } catch {
      /* ignore */
    }
  }

  const ranked = rankTracks(candidates, owned);
  if (ranked.length === 0) {
    throw new Error(
      "No fresh tracks found. Check API access, market, or query packs.",
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  const descParts = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k}:${v}`);
  const description = `Fresh 40 · ${date} · sources ${descParts.join(" · ")} · auto by Spotify Fresh Agent`.slice(
    0,
    300,
  );

  let playlist = existing;
  if (!playlist) {
    console.log(`Creating playlist "${PLAYLIST_NAME}"…`);
    playlist = await createPlaylist(me.id, PLAYLIST_NAME, description);
  } else {
    await updatePlaylistDetails(playlist.id, description);
  }

  await replacePlaylistTracks(
    playlist.id,
    ranked.map((t) => t.uri),
  );

  const artistCounts = new Map<string, number>();
  for (const t of ranked) {
    const a = t.artists[0] ?? "Unknown";
    artistCounts.set(a, (artistCounts.get(a) ?? 0) + 1);
  }
  const topArtists = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name]) => name);

  const finalSources: Record<string, number> = {};
  for (const t of ranked) {
    const bucket = t.source.split(":")[0] ?? t.source;
    finalSources[bucket] = (finalSources[bucket] ?? 0) + 1;
  }

  const summary: RefreshSummary = {
    date,
    playlistId: playlist.id,
    playlistUrl:
      playlist.external_urls?.spotify ??
      `https://open.spotify.com/playlist/${playlist.id}`,
    trackCount: ranked.length,
    sources: finalSources,
    topArtists,
    tracks: ranked.map((t) => ({
      id: t.id,
      name: t.name,
      artists: t.artists.join(", "),
    })),
  };

  mkdirSync(dirname(RUNS_LATEST_PATH), { recursive: true });
  writeFileSync(RUNS_LATEST_PATH, JSON.stringify(summary, null, 2));
  console.log(`Wrote ${RUNS_LATEST_PATH}`);
  console.log(`Playlist: ${summary.playlistUrl}`);
  console.log(`Tracks: ${summary.trackCount}`);
  return summary;
}

export function readLastSummary(): RefreshSummary | null {
  try {
    if (!existsSync(RUNS_LATEST_PATH)) return null;
    return JSON.parse(readFileSync(RUNS_LATEST_PATH, "utf8")) as RefreshSummary;
  } catch {
    return null;
  }
}
