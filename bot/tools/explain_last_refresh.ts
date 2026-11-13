import { defineTool } from "@grok/agent-sdk/tools";
import { z } from "zod";
import { readLastSummary } from "../../src/refresh.js";

export default defineTool({
  description:
    "Explain the last Fresh 40 refresh from runs/latest.json (no Spotify API call).",
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
      playlistUrl: summary.playlistUrl,
      trackCount: summary.trackCount,
      sources: summary.sources,
      topArtists: summary.topArtists,
      sample: summary.tracks.slice(0, 10),
    };
  },
});
