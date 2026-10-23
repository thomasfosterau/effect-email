---
"@thomasfosterau/effect-connect-slack": patch
"@thomasfosterau/effect-connect-discord": patch
---

The Slack and Discord providers no longer let a message ping a whole channel by default, so a `ChatMessage.text` assembled from user input cannot reach `@everyone`.

- `@thomasfosterau/effect-connect-slack`: `<!channel>`, `<!here>`, `<!everyone>` and `<!subteam^…>` in the text are escaped to `&lt;!…>`, which Slack shows as written and pings nobody (`escapeMassMentions`). User mentions, links and formatting are unchanged.
- `@thomasfosterau/effect-connect-discord`: every send carries `allowed_mentions: { parse: [] }`, so `@everyone`, `@here`, role and user mentions are shown but ping nobody (`DiscordAllowedMentions`).

`allowMentions: true` on `Slack.layer` / `Discord.layer` (and the new second argument of `toSlackPayload` / `toDiscordPayload`) opts back in. There is no environment variable for it: `layerConfig` and `resolveTransport` always suppress.
