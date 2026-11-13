# Spotify Fresh Agent

Mac chat agent + CLI that rebuilds a single Spotify playlist:

**`Fresh 40 · Daily`**

Daily GitHub Action runs the same refresh.

## Why this shape

Spotify’s UI is weak for “give me new songs like my taste every week.”  
New Spotify Web API apps also lost Recommendations / Browse New Releases.  
This agent uses **search packs + your top artists/tracks + optional playlist IDs**.

## One-time setup

1. Create a Spotify app at [Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add redirect URI exactly:
   ```
   http://127.0.0.1:8787/callback
   ```
3. Copy `.env.example` → `.env` and set:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_MARKET` (default `EG`)
4. Install and login:
   ```bash
   cd /Users/ahmedashraf/Apps/spotify-fresh
   npm install
   npm run login
   ```
5. Open Spotify → playlists → **Fresh 40 · Daily** after the first refresh.

### GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|--------|
| `SPOTIFY_CLIENT_ID` | Dashboard client id |
| `SPOTIFY_CLIENT_SECRET` | Dashboard client secret |
| `SPOTIFY_REFRESH_TOKEN` | Printed by `npm run login` |

Optional variable: `SPOTIFY_MARKET` (e.g. `EG`, `US`).

Push this repo to GitHub, then enable Actions. Cron: `0 6 * * *` UTC (or Run workflow manually).

## CLI

```bash
npm run login                 # browser OAuth once
npm run refresh               # rebuild Fresh 40 now
npm run status                # playlist + last run
npm run search -- "arabic pop 2026"
```

## Mac chat agent

Requires Cursor login / `CURSOR_API_KEY` for model turns.

```bash
npx @grok/agent-sdk@0.6.0 serve --dir . --mode single --dev
# open http://127.0.0.1:3000/playground
```

Or one shot:

```bash
npx @grok/agent-sdk@0.6.0 run --dir . --message "Refresh my Fresh 40 playlist"
```

Tools: `refresh_fresh_40`, `spotify_search`, `list_fresh_playlist`, `explain_last_refresh`.

## Config

- [`config/queries.yaml`](config/queries.yaml) — search packs (pop / arabic / trending / variety)
- [`config/source-playlists.yaml`](config/source-playlists.yaml) — optional playlist IDs to sample
- [`runs/latest.json`](runs/latest.json) — last refresh summary

## Scopes requested

`user-top-read`, `user-read-recently-played`, `user-library-read`,  
`playlist-modify-private`, `playlist-modify-public`, `playlist-read-private`,  
`user-follow-read`
