import { defineEval, includes } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  cases: [
    {
      id: "explain-last",
      description: "Agent uses explain_last_refresh for status questions.",
      async test(t) {
        await t.send(
          "What was the last Fresh 40 refresh? Use your tools; do not invent tracks.",
        );
        t.succeeded();
        t.calledTool("explain_last_refresh");
        t.check(t.reply, includes(/fresh|refresh|playlist|run/i));
      },
    },
  ],
});
