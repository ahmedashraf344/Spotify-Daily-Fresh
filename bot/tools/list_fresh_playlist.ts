import { defineTool } from "@grok/agent-sdk/tools";
import { z } from "zod";
import { PLAYLISTS } from "../../src/config.js";
import { findPlaylistByName } from "../../src/spotify.js";

export default defineTool({
  description:
    "List the three Fresh 40 playlists (English, Arabic, Random) on the user's Spotify account.",
  effect: "read",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    if (ctx.session.purpose === "eval") {
      return {
        playlists: Object.values(PLAYLISTS).map((p) => ({
          found: true,
          name: p.name,
          id: `eval-${p.key}`,
          url: `https://open.spotify.com/playlist/eval-${p.key}`,
        })),
      };
    }
    const playlists = [];
    for (const def of Object.values(PLAYLISTS)) {
      const playlist = await findPlaylistByName(def.name);
      playlists.push(
        playlist
          ? {
              found: true,
              name: def.name,
              id: playlist.id,
              url: playlist.external_urls?.spotify ?? null,
            }
          : { found: false, name: def.name },
      );
    }
    return { playlists };
  },
});
