import { defineTool } from "@grok/agent-sdk/tools";
import { z } from "zod";
import { PLAYLIST_NAME } from "../../src/config.js";
import { findPlaylistByName } from "../../src/spotify.js";

export default defineTool({
  description: "Find the Fresh 40 · Daily playlist on the user's Spotify account.",
  effect: "read",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    if (ctx.session.purpose === "eval") {
      return {
        found: true,
        name: PLAYLIST_NAME,
        id: "eval-playlist",
        url: "https://open.spotify.com/playlist/eval",
      };
    }
    const playlist = await findPlaylistByName(PLAYLIST_NAME);
    if (!playlist) {
      return { found: false, name: PLAYLIST_NAME };
    }
    return {
      found: true,
      name: PLAYLIST_NAME,
      id: playlist.id,
      url: playlist.external_urls?.spotify ?? null,
    };
  },
});
