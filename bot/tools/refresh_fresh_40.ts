import { defineTool } from "@grok/agent-sdk/tools";
import { z } from "zod";
import { refreshFresh40 } from "../../src/refresh.js";

export default defineTool({
  description:
    "Rebuild all three Spotify playlists: Fresh 40 · English, Fresh 40 · Arabic, Fresh 40 · Random. Takes ~1–2 minutes.",
  effect: "write",
  inputSchema: z.object({
    confirm: z
      .boolean()
      .describe("Set true to confirm rebuilding all three playlists."),
  }),
  async execute({ confirm }, ctx) {
    if (!confirm) {
      return { ok: false, error: "Pass confirm=true to rebuild the Fresh playlists." };
    }
    if (ctx.session.purpose === "eval") {
      return {
        ok: true,
        eval: true,
        playlists: [
          { name: "Fresh 40 · English", trackCount: 40 },
          { name: "Fresh 40 · Arabic", trackCount: 40 },
          { name: "Fresh 40 · Random", trackCount: 40 },
        ],
      };
    }
    const summary = await refreshFresh40();
    return {
      ok: true,
      date: summary.date,
      playlists: summary.playlists.map((p) => ({
        key: p.key,
        name: p.name,
        playlistUrl: p.playlistUrl,
        trackCount: p.trackCount,
        topArtists: p.topArtists.slice(0, 5),
        sample: p.tracks.slice(0, 5),
      })),
      totalTracks: summary.trackCount,
    };
  },
});
