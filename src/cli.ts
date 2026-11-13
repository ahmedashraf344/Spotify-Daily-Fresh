#!/usr/bin/env node
import { loginInteractive } from "./auth.js";
import { PLAYLIST_NAME } from "./config.js";
import { refreshFresh40, readLastSummary } from "./refresh.js";
import { findPlaylistByName, searchTracks } from "./spotify.js";

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "login":
      await loginInteractive();
      break;
    case "refresh": {
      const summary = await refreshFresh40();
      console.log(JSON.stringify(summary, null, 2));
      break;
    }
    case "status": {
      const last = readLastSummary();
      const live = await findPlaylistByName(PLAYLIST_NAME).catch(() => null);
      console.log(
        JSON.stringify(
          {
            playlistName: PLAYLIST_NAME,
            livePlaylistId: live?.id ?? null,
            liveUrl: live?.external_urls?.spotify ?? null,
            lastRun: last,
          },
          null,
          2,
        ),
      );
      break;
    }
    case "search": {
      const q = rest.join(" ").trim();
      if (!q) {
        console.error('Usage: npm run search -- "arabic pop 2026"');
        process.exit(1);
      }
      const tracks = await searchTracks(q, "cli-search", 15);
      console.log(
        JSON.stringify(
          tracks.map((t) => ({
            id: t.id,
            name: t.name,
            artists: t.artists.join(", "),
            popularity: t.popularity,
          })),
          null,
          2,
        ),
      );
      break;
    }
    default:
      console.log(`Spotify Fresh Agent

Usage:
  npm run login              Connect Spotify (browser OAuth)
  npm run refresh            Rebuild "${PLAYLIST_NAME}"
  npm run status             Show playlist + last run
  npm run search -- "query"  Search tracks

GitHub Actions uses the same refresh command with secrets.`);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
