import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  FRESH_NAME_PREFIXES,
  PLAYLISTS,
  RUNS_LATEST_PATH,
  type PlaylistKey,
} from "./config.js";
import { collectCandidates } from "./discover.js";
import {
  addTracksToBlock,
  emptyBlockIndex,
  rankTracks,
  type Lane,
} from "./rank.js";
import { appendHistory, blockFromHistory, mergeBlock } from "./history.js";
import {
  createPlaylist,
  findPlaylistByName,
  findPlaylistsByNamePrefixes,
  getMe,
  getPlaylistTracks,
  getRecentlyPlayed,
  getSavedTracks,
  getTopTracks,
  replacePlaylistTracks,
  updatePlaylistDetails,
} from "./spotify.js";
import type { PlaylistSummary, RefreshSummary, SpotifyTrack } from "./types.js";

function summarizePlaylist(
  key: string,
  name: string,
  playlist: { id: string; external_urls?: { spotify?: string } },
  ranked: SpotifyTrack[],
): PlaylistSummary {
  const artistCounts = new Map<string, number>();
  for (const t of ranked) {
    const a = t.artists[0] ?? "Unknown";
    artistCounts.set(a, (artistCounts.get(a) ?? 0) + 1);
  }
  const topArtists = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([n]) => n);

  const sources: Record<string, number> = {};
  for (const t of ranked) {
    const bucket = t.source.split(":")[0] ?? t.source;
    sources[bucket] = (sources[bucket] ?? 0) + 1;
  }

  return {
    key,
    name,
    playlistId: playlist.id,
    playlistUrl:
      playlist.external_urls?.spotify ??
      `https://open.spotify.com/playlist/${playlist.id}`,
    trackCount: ranked.length,
    sources,
    topArtists,
    tracks: ranked.map((t) => ({
      id: t.id,
      name: t.name,
      artists: t.artists.join(", "),
    })),
  };
}

async function upsertPlaylist(
  userId: string,
  name: string,
  description: string,
  uris: string[],
): Promise<{ id: string; external_urls?: { spotify?: string } }> {
  let playlist = await findPlaylistByName(name);
  if (playlist) {
    await updatePlaylistDetails(playlist.id, description);
  } else {
    console.log(`Creating playlist "${name}"…`);
    playlist = await createPlaylist(userId, name, description);
  }
  await replacePlaylistTracks(playlist.id, uris);
  return playlist;
}

export async function refreshFresh40(): Promise<RefreshSummary> {
  const me = await getMe();
  console.log(`User: ${me.display_name ?? me.id}`);

  const block = emptyBlockIndex();

  // 1) Liked songs (full metadata for fingerprinting)
  const liked = await getSavedTracks(25);
  mergeBlock(block, liked);
  console.log(`Blocked liked: ${liked.length}`);

  // 2) Top + recent — known songs, never put back into Fresh
  const [top, recent] = await Promise.all([
    getTopTracks("short_term", 50),
    getRecentlyPlayed(50),
  ]);
  mergeBlock(block, top);
  mergeBlock(block, recent);
  console.log(`Blocked top+recent: ${top.length + recent.length}`);

  // 3) Every playlist named Fresh 40* (English/Arabic/Random/old Daily)
  const freshPlaylists = await findPlaylistsByNamePrefixes(FRESH_NAME_PREFIXES);
  for (const p of freshPlaylists) {
    try {
      const tracks = await getPlaylistTracks(p.id, `fresh-old:${p.name}`, 100);
      mergeBlock(block, tracks);
      console.log(`Blocked ${p.name}: ${tracks.length}`);
    } catch (e) {
      console.warn(`Could not read ${p.name}:`, e);
    }
  }

  // 4) Multi-day history file
  const hist = blockFromHistory();
  addTracksToBlock(
    block,
    [...hist.ids].map((id) => ({
      id,
      uri: `spotify:track:${id}`,
      name: "",
      artists: [],
      popularity: 0,
      source: "history",
    })),
  );
  for (const fp of hist.fingerprints) block.fingerprints.add(fp);
  console.log(
    `Block index: ids=${block.ids.size} fingerprints=${block.fingerprints.size}`,
  );

  const { candidates, sourceCounts } = await collectCandidates();
  console.log(`Raw candidates: ${candidates.length}`);

  const date = new Date().toISOString().slice(0, 10);
  const descBits = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k}:${v}`)
    .join(" · ");

  const sessionBlock = emptyBlockIndex();
  const order: PlaylistKey[] = ["english", "arabic", "random"];
  const playlists: PlaylistSummary[] = [];

  for (const key of order) {
    const def = PLAYLISTS[key];
    const lane = def.lane as Lane;
    const stats = { skipped: 0, reasons: {} as Record<string, number> };
    const ranked = rankTracks(candidates, block, {
      lane,
      sessionBlock,
      stats,
    });

    console.log(
      `${def.name}: picked ${ranked.length}, skipped ${stats.skipped}`,
      stats.reasons,
    );

    if (ranked.length === 0) {
      console.warn(`No tracks for ${def.name} — skipping write.`);
      continue;
    }

    const description =
      `${def.name} · ${date} · ${ranked.length} unique · no likes/old Fresh · ${descBits} · Spotify Daily Fresh`.slice(
        0,
        300,
      );

    console.log(`Writing ${def.name} (${ranked.length})…`);
    const playlist = await upsertPlaylist(
      me.id,
      def.name,
      description,
      ranked.map((t) => t.uri),
    );

    playlists.push(summarizePlaylist(key, def.name, playlist, ranked));
    console.log(`  → ${playlists[playlists.length - 1]!.playlistUrl}`);
  }

  if (playlists.length === 0) {
    throw new Error(
      "No fresh tracks found for any playlist. Check API access, market, or query packs.",
    );
  }

  const primary = playlists[0]!;
  const summary: RefreshSummary = {
    date,
    playlists,
    playlistId: primary.playlistId,
    playlistUrl: primary.playlistUrl,
    trackCount: playlists.reduce((n, p) => n + p.trackCount, 0),
    sources: Object.fromEntries(playlists.map((p) => [p.key, p.trackCount])),
    topArtists: [...new Set(playlists.flatMap((p) => p.topArtists))].slice(
      0,
      12,
    ),
    tracks: playlists.flatMap((p) => p.tracks).slice(0, 24),
  };

  mkdirSync(dirname(RUNS_LATEST_PATH), { recursive: true });
  writeFileSync(RUNS_LATEST_PATH, JSON.stringify(summary, null, 2));
  appendHistory(summary);
  console.log(`Wrote ${RUNS_LATEST_PATH} + block history`);
  console.log(
    `Done: ${playlists.map((p) => `${p.name}=${p.trackCount}`).join(", ")}`,
  );
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
