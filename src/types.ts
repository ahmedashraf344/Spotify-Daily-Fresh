export type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  popularity: number;
  albumName?: string;
  source: string;
};

export type PlaylistSummary = {
  key: string;
  name: string;
  playlistId: string;
  playlistUrl: string;
  trackCount: number;
  sources: Record<string, number>;
  topArtists: string[];
  tracks: Array<{ id: string; name: string; artists: string }>;
};

export type RefreshSummary = {
  date: string;
  playlists: PlaylistSummary[];
  /** Back-compat: first playlist (english) for older tools */
  playlistId: string;
  playlistUrl: string;
  trackCount: number;
  sources: Record<string, number>;
  topArtists: string[];
  tracks: Array<{ id: string; name: string; artists: string }>;
};
