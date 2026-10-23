# `@thomasfosterau/effect-connect-discord`

The Discord chat provider for [`@thomasfosterau/effect-connect`](https://github.com/thomasfosterau/effect-connect/tree/trunk/packages/core#readme): a channel webhook (Execute Webhook) over Effect's `HttpClient` (`effect/http`) with no SDK, a `Redacted` webhook URL checked against `discord.com` before any request, a no-op layer for un-provisioned stages and an env-driven resolver that picks between the two.

This package was created using Claude Code, and its API is in flux: expect churn and breaking changes.

## Install

```bash
pnpm add @thomasfosterau/effect-connect-discord @thomasfosterau/effect-connect effect
```

`effect` (`>=4.0.0-rc.118`) is a required peer dependency. Node.js 22 or newer is required. Nothing here is Node-shaped: the provider runs on Cloudflare Workers and in browsers as well as on Node.

## Usage

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/http";
import { sendChat } from "@thomasfosterau/effect-connect";
import * as Discord from "@thomasfosterau/effect-connect-discord";

const ChatLive = Discord.layer({
  webhookUrl: Redacted.make(process.env.DISCORD_WEBHOOK_URL!),
}).pipe(Layer.provide(FetchHttpClient.layer));

const program = sendChat({ text: "Deploy finished", username: "CI" }).pipe(
  Effect.provide(ChatLive),
);
// result.id is Discord's message id (a snowflake), as an Option (always `some` here)
```

The message is `{ text, username? }`, sent as Discord's `{ content, username? }`. `text` is Discord Markdown, at most `DISCORD_CONTENT_LIMIT` (2000) characters: a longer one fails with `ChatSendError` before any request. `username` overrides the webhook's display name for this message.

Mentions are suppressed by default: every send carries `allowed_mentions: { parse: [] }`, so `@everyone`, `@here`, role and user mentions in `text` are shown but ping nobody, and a message assembled from user input cannot ping a whole server. Pass `allowMentions: true` to `Discord.layer` when every message's text is trusted (the body then carries no `allowed_mentions`, and Discord pings what the text mentions); `layerConfig` and `resolveTransport` always suppress.

`Discord.layerConfig` reads `DISCORD_WEBHOOK_URL` (redacted) through `effect/Config` and fails at layer construction with a `ConfigError` when it is unset or empty. On a Worker whose stages may lack the webhook, use `resolveTransport(env)` below.

## API

| Export | What it is |
| --- | --- |
| `layer(config)`, `layerConfig` | The `ChatService` over the `HttpClient` in context, from literal config or from `DISCORD_WEBHOOK_URL`. |
| `resolveTransport(env)`, `configFromEnv(env)`, `DiscordEnv` | Pick the live sender or the no-op from a Worker env; needs no `HttpClient`. |
| `noop` | The `ChatService` that succeeds without sending and logs one line naming neither the text nor the URL. |
| `DiscordConfig`, `DiscordConfigInput`, `DEFAULT_BASE_URL` | The webhook URL, request origin and mention opt-in (`allowMentions`) as a service. |
| `parseWebhookUrl`, `DiscordWebhook` | The check every send runs: the path and token of a `https://discord.com/api/webhooks/<id>/<token>` URL, `none` for anything else. |
| `toDiscordPayload`, `DiscordPayloadOptions`, `DiscordWebhookPayload`, `DiscordAllowedMentions`, `DISCORD_CONTENT_LIMIT` | The core-message → webhook-body mapping and the length Discord accepts. |
| `layerChatService` | The `ChatService` over a `DiscordConfig` and `HttpClient` you provide yourself. |

## On a Worker: `resolveTransport(env)`

```ts
import * as Effect from "effect/Effect";
import type { ChatService } from "@thomasfosterau/effect-connect";
import * as Discord from "@thomasfosterau/effect-connect-discord";

// Your request handler; it posts through the ChatService in context.
declare const handle: (request: Request) => Effect.Effect<Response, never, ChatService>;

export default {
  fetch: (request: Request, env: Discord.DiscordEnv) =>
    handle(request).pipe(Effect.provide(Discord.resolveTransport(env)), Effect.runPromise),
};
```

The live sender is used when `DISCORD_WEBHOOK_URL` is bound and non-blank (as a string or a `Redacted`); otherwise `Discord.noop`, which succeeds without sending and logs one line. A bound URL that is not Discord's still selects the live sender, whose every send then fails: a misconfiguration is loud. The no-op is only safe while the message is advisory.

## What the transport pins

- **The webhook URL is the credential.** Anyone holding it can post to the channel, or delete the webhook. It is `Redacted`, and it never appears in a log line or an error message: Effect's own `HttpClientError` message names the request URL, so errors are composed without it, the URL and its token are redacted from any vendor or transport text they quote, and no error carries the request as its `cause`.
- **The URL is checked before any request.** It must be `https:`, on exactly `discord.com` or `discordapp.com` with no port, userinfo, query or fragment, with an `/api/webhooks/<id>/<token>` path (`/api/v<n>/webhooks/…` too). Anything else fails with `ChatSendError` (`status: none`) and nothing is sent.
- **A fixed literal origin.** The request goes to `https://discord.com` plus the checked path, with `?wait=true` so Discord answers the created message. `baseUrl` replaces only that origin, for a stub server in a test, never for request input; it has no environment variable.
- **`redirect: "error"`** on the underlying fetch, layered over any `FetchHttpClient.RequestInit` defaults you provide, so a 3xx can never replay the token-bearing request to another host.
- **Truncated error bodies.** A non-2xx becomes a `ChatSendError` with `provider: "discord"`, `status: some(status)` and at most 200 characters of the response; an unreadable body still fails with the status; a transport failure, or a send refused before any request, carries `status: none`.
- **No mentions by default.** `allowed_mentions: { parse: [] }` on every send unless the config sets `allowMentions: true`.
- **No retry.** The caller decides the policy (`Effect.retry`); a 429's `retry_after` is in the truncated body.
- **Batches are sent in order, one at a time.** A webhook has no batch endpoint, and a channel shows messages in the order they arrive, so `sendBatch` posts each message after the last and fails on the first failure.

## License

MIT
