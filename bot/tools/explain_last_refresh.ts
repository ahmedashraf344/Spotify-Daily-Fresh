import { defineTool } from "@grok/agent-sdk/tools";
import { z } from "zod";
import { readLastSummary } from "../../src/refresh.js";

export default defineTool({
  description:
    "Explain the last Fresh refresh from runs/latest.json (all three playlists).",
  effect: "read",
  inputSchema: z.object({}),
  async execute() {
    const summary = readLastSummary();
    if (!summary) {
      return {
        found: false,
        hint: "No runs/latest.json yet. Call refresh_fresh_40 or npm run refresh.",
      };
    }
    return {
      found: true,
      date: summary.date,
      playlists: (summary.playlists ?? []).map((p) => ({
        name: p.name,
        playlistUrl: p.playlistUrl,
        trackCount: p.trackCount,
        topArtists: p.topArtists,
        sample: p.tracks.slice(0, 5),
      })),
      totalTracks: summary.trackCount,
    };
  },
});
