import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { QUERIES_PATH, SOURCE_PLAYLISTS_PATH } from "./config.js";
import {
  getArtistTopOrAlbumsTracks,
  getPlaylistTracks,
  getRecentlyPlayed,
  getTopArtists,
  getTopTracks,
  searchTracks,
} from "./spotify.js";
import type { SpotifyTrack } from "./types.js";

type QueriesFile = {
  packs: Record<string, string[]>;
};

type SourcePlaylistsFile = {
  playlists: string[];
};

function loadQueries(): QueriesFile {
  return parseYaml(readFileSync(QUERIES_PATH, "utf8")) as QueriesFile;
}

function loadSourcePlaylists(): string[] {
  const raw = parseYaml(
    readFileSync(SOURCE_PLAYLISTS_PATH, "utf8"),
  ) as SourcePlaylistsFile;
  return (raw.playlists ?? []).filter(Boolean);
}

/** Collect candidate tracks from taste + search packs + optional playlists. */
export async function collectCandidates(): Promise<{
  candidates: SpotifyTrack[];
  sourceCounts: Record<string, number>;
}> {
  const sourceCounts: Record<string, number> = {};
  const bump = (key: string, n = 1) => {
    sourceCounts[key] = (sourceCounts[key] ?? 0) + n;
  };

  const candidates: SpotifyTrack[] = [];
  const pushAll = (tracks: SpotifyTrack[], bucket: string) => {
    for (const t of tracks) {
      candidates.push(t);
      bump(bucket);
    }
  };

  console.log("Fetching taste signals…");
  const [topTracks, topArtists, recent] = await Promise.all([
    getTopTracks("short_term", 20),
    getTopArtists("medium_term", 15),
    getRecentlyPlayed(20),
  ]);
  pushAll(topTracks, "taste");
  pushAll(recent, "taste");

  console.log(`Expanding ${topArtists.length} top artists…`);
  for (const artist of topArtists.slice(0, 12)) {
    try {
      const tracks = await getArtistTopOrAlbumsTracks(artist.id, artist.name);
      pushAll(tracks, "artist");
    } catch (e) {
      console.warn(`Artist expand failed for ${artist.name}:`, e);
    }
  }

  const queries = loadQueries();
  console.log("Running search packs…");
  for (const [pack, list] of Object.entries(queries.packs ?? {})) {
    for (const q of list) {
      try {
        const tracks = await searchTracks(q, `search:${pack}`, 8);
        pushAll(tracks, `search:${pack}`);
      } catch (e) {
        console.warn(`Search failed for "${q}":`, e);
      }
    }
  }

  const playlistIds = loadSourcePlaylists();
  for (const id of playlistIds) {
    try {
      const tracks = await getPlaylistTracks(id, `playlist:${id}`, 30);
      pushAll(tracks, "playlist");
    } catch (e) {
      console.warn(`Playlist ${id} failed (may be blocked for new apps):`, e);
    }
  }

  return { candidates, sourceCounts };
}
