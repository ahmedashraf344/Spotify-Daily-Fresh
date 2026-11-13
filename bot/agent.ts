import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  name: "Spotify Fresh",
  model: {
    id: "grok-4.7",
    params: [
      { id: "reasoning_effort", value: "high" },
      { id: "fast", value: "true" },
    ],
  },
  // Custom tools in bot/tools/*.ts are auto-loaded.
  local: {
    // Need network + filesystem for Spotify OAuth tokens and API calls.
    sandbox: false,
  },
});
