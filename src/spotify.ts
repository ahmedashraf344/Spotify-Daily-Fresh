import { getAccessToken } from "./auth.js";
import { market } from "./config.js";
import type { SpotifyTrack } from "./types.js";

type Json = Record<string, unknown>;

async function api<T = Json>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  const url = path.startsWith("http")
    ? path
    : `https://api.spotify.com/v1${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 204) return {} as T;
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Spotify ${res.status} ${path}: ${text.slice(0, 400)}`);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

function mapTrack(raw: Json, source: string): SpotifyTrack | null {
  const id = raw.id as string | undefined;
  const uri = raw.uri as string | undefined;
  const name = raw.name as string | undefined;
  if (!id || !uri || !name) return null;
  const artists = ((raw.artists as Json[] | undefined) ?? [])
    .map((a) => String(a.name ?? ""))
    .filter(Boolean);
  const album = raw.album as Json | undefined;
  return {
    id,
    uri,
    name,
    artists,
    popularity: Number(raw.popularity ?? 0),
    albumName: album?.name ? String(album.name) : undefined,
    source,
  };
}

export async function getMe(): Promise<{ id: string; display_name?: string }> {
  return api("/me");
}

export async function getTopTracks(
  timeRange: "short_term" | "medium_term" | "long_term" = "medium_term",
  limit = 20,
): Promise<SpotifyTrack[]> {
  const data = await api<{ items: Json[] }>(
    `/me/top/tracks?time_range=${timeRange}&limit=${limit}`,
  );
  return (data.items ?? [])
    .map((t) => mapTrack(t, "taste:top"))
    .filter((t): t is SpotifyTrack => t != null);
}

export async function getTopArtists(
  timeRange: "short_term" | "medium_term" | "long_term" = "medium_term",
  limit = 20,
): Promise<Array<{ id: string; name: string }>> {
  const data = await api<{ items: Json[] }>(
    `/me/top/artists?time_range=${timeRange}&limit=${limit}`,
  );
  return (data.items ?? []).map((a) => ({
    id: String(a.id),
    name: String(a.name),
  }));
}

export async function getRecentlyPlayed(limit = 30): Promise<SpotifyTrack[]> {
  const data = await api<{ items: Array<{ track: Json }> }>(
    `/me/player/recently-played?limit=${limit}`,
  );
  return (data.items ?? [])
    .map((i) => mapTrack(i.track, "taste:recent"))
    .filter((t): t is SpotifyTrack => t != null);
}

export async function getSavedTrackIds(maxPages = 10): Promise<Set<string>> {
  const ids = new Set<string>();
  let url: string | null = `/me/tracks?limit=50`;
  let pages = 0;
  while (url && pages < maxPages) {
    const data: {
      items: Array<{ track: Json | null }>;
      next: string | null;
    } = await api(url);
    for (const item of data.items ?? []) {
      const id = item.track?.id;
      if (typeof id === "string") ids.add(id);
    }
    url = data.next;
    pages++;
  }
  return ids;
}

export async function searchTracks(
  query: string,
  source: string,
  limit = 10,
): Promise<SpotifyTrack[]> {
  const q = encodeURIComponent(query);
  const m = market();
  // Feb 2026: search limit max is 10.
  const capped = Math.min(Math.max(limit, 1), 10);
  const data = await api<{ tracks?: { items: Json[] } }>(
    `/search?type=track&q=${q}&limit=${capped}&market=${m}`,
  );
  return (data.tracks?.items ?? [])
    .map((t) => mapTrack(t, source))
    .filter((t): t is SpotifyTrack => t != null);
}

export async function getArtistTopOrAlbumsTracks(
  artistId: string,
  artistName: string,
): Promise<SpotifyTrack[]> {
  // Prefer search by artist name (works under restricted API modes).
  const tracks = await searchTracks(
    `artist:"${artistName}" year:2024-2026`,
    `artist:${artistName}`,
    8,
  );
  if (tracks.length > 0) return tracks;
  try {
    const albums = await api<{ items: Json[] }>(
      `/artists/${artistId}/albums?include_groups=single,album&limit=5&market=${market()}`,
    );
    const out: SpotifyTrack[] = [];
    for (const album of albums.items ?? []) {
      const albumId = album.id as string;
      if (!albumId) continue;
      const albumTracks = await api<{ items: Json[] }>(
        `/albums/${albumId}/tracks?limit=10&market=${market()}`,
      );
      for (const t of albumTracks.items ?? []) {
        const mapped = mapTrack(
          {
            ...t,
            popularity: 40,
            artists: t.artists ?? [{ name: artistName }],
            album: { name: album.name },
          },
          `artist-album:${artistName}`,
        );
        if (mapped) out.push(mapped);
      }
      if (out.length >= 8) break;
    }
    return out.slice(0, 8);
  } catch {
    return [];
  }
}

export async function getPlaylistTracks(
  playlistId: string,
  source: string,
  max = 40,
): Promise<SpotifyTrack[]> {
  const out: SpotifyTrack[] = [];
  // Feb 2026: /tracks → /items
  let url: string | null = `/playlists/${playlistId}/items?limit=50&market=${market()}`;
  while (url && out.length < max) {
    const data: {
      items: Array<{ track?: Json | null; item?: Json | null }>;
      next: string | null;
    } = await api(url);
    for (const row of data.items ?? []) {
      const raw = (row.track ?? row.item) as Json | null | undefined;
      if (!raw || raw.is_local) continue;
      const mapped = mapTrack(raw, source);
      if (mapped) out.push(mapped);
      if (out.length >= max) break;
    }
    url = data.next;
  }
  return out;
}

export async function findPlaylistByName(
  name: string,
): Promise<{ id: string; external_urls?: { spotify?: string } } | null> {
  let url: string | null = `/me/playlists?limit=50`;
  while (url) {
    const data: {
      items: Array<{
        id: string;
        name: string;
        external_urls?: { spotify?: string };
      }>;
      next: string | null;
    } = await api(url);
    for (const p of data.items ?? []) {
      if (p.name === name) return p;
    }
    url = data.next;
  }
  return null;
}

export async function createPlaylist(
  _userId: string,
  name: string,
  description: string,
): Promise<{ id: string; external_urls?: { spotify?: string } }> {
  // Spotify deprecated POST /users/{id}/playlists — use /me/playlists.
  return api(`/me/playlists`, {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      public: false,
    }),
  });
}

export async function replacePlaylistTracks(
  playlistId: string,
  uris: string[],
): Promise<void> {
  // Feb 2026: PUT /playlists/{id}/tracks → /items
  await api(`/playlists/${playlistId}/items`, {
    method: "PUT",
    body: JSON.stringify({ uris: uris.slice(0, 100) }),
  });
}

export async function updatePlaylistDetails(
  playlistId: string,
  description: string,
): Promise<void> {
  await api(`/playlists/${playlistId}`, {
    method: "PUT",
    body: JSON.stringify({ description }),
  });
}
