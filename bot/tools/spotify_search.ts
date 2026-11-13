import { defineTool } from "@grok/agent-sdk/tools";
import { z } from "zod";
import { searchTracks } from "../../src/spotify.js";

export default defineTool({
  description: "Search Spotify for tracks by free-text query.",
  effect: "read",
  inputSchema: z.object({
    query: z.string().min(1).max(200).describe("Search query"),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  async execute({ query, limit }, ctx) {
    if (ctx.session.purpose === "eval") {
      return {
        tracks: [
          {
            id: "eval1",
            name: "Eval Track",
            artists: "Eval Artist",
            popularity: 50,
          },
        ],
      };
    }
    const tracks = await searchTracks(query, "agent-search", limit ?? 10);
    return {
      query,
      tracks: tracks.map((t) => ({
        id: t.id,
        name: t.name,
        artists: t.artists.join(", "),
        popularity: t.popularity,
        uri: t.uri,
      })),
    };
  },
});
