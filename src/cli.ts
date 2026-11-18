#!/usr/bin/env node
import { loginInteractive } from "./auth.js";
import { PLAYLISTS } from "./config.js";
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
      const live = [];
      for (const def of Object.values(PLAYLISTS)) {
        const p = await findPlaylistByName(def.name).catch(() => null);
        live.push({
          name: def.name,
          id: p?.id ?? null,
          url: p?.external_urls?.spotify ?? null,
        });
      }
      console.log(JSON.stringify({ playlists: live, lastRun: last }, null, 2));
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
      console.log(`Spotify Daily Fresh

Playlists:
  - ${PLAYLISTS.english.name}
  - ${PLAYLISTS.arabic.name}
  - ${PLAYLISTS.random.name}

Usage:
  npm run login              Connect Spotify (browser OAuth)
  npm run refresh            Rebuild all 3 Fresh 40 playlists
  npm run status             Show playlists + last run
  npm run search -- "query"  Search tracks

GitHub Actions uses the same refresh command with secrets.`);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
