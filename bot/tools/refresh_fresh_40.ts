import { defineTool } from "@grok/agent-sdk/tools";
import { z } from "zod";
import { refreshFresh40 } from "../../src/refresh.js";

export default defineTool({
  description:
    "Rebuild the Spotify playlist Fresh 40 · Daily from taste + trending search packs. Takes up to ~1–2 minutes.",
  effect: "write",
  inputSchema: z.object({
    confirm: z
      .boolean()
      .describe("Set true to confirm rebuilding the playlist."),
  }),
  async execute({ confirm }, ctx) {
    if (!confirm) {
      return { ok: false, error: "Pass confirm=true to rebuild Fresh 40." };
    }
    if (ctx.session.purpose === "eval") {
      return {
        ok: true,
        eval: true,
        playlistUrl: "https://open.spotify.com/playlist/eval",
        trackCount: 40,
      };
    }
    const summary = await refreshFresh40();
    return {
      ok: true,
      date: summary.date,
      playlistId: summary.playlistId,
      playlistUrl: summary.playlistUrl,
      trackCount: summary.trackCount,
      sources: summary.sources,
      topArtists: summary.topArtists,
      sample: summary.tracks.slice(0, 8),
    };
  },
});
