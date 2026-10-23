# `@thomasfosterau/effect-connect-slack`

The Slack chat provider for [`@thomasfosterau/effect-connect`](https://github.com/thomasfosterau/effect-connect/tree/trunk/packages/core#readme): an incoming webhook over Effect's `HttpClient` (`effect/http`) with no SDK, a `Redacted` webhook URL checked against `hooks.slack.com` before any request, a no-op layer for un-provisioned stages and an env-driven resolver that picks between the two.

This package was created using Claude Code, and its API is in flux: expect churn and breaking changes.

## Install

```bash
pnpm add @thomasfosterau/effect-connect-slack @thomasfosterau/effect-connect effect
```

`effect` (`>=4.0.0-rc.118`) is a required peer dependency. Node.js 22 or newer is required. Nothing here is Node-shaped: the provider runs on Cloudflare Workers and in browsers as well as on Node.

## Usage

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/http";
import { sendChat } from "@thomasfosterau/effect-connect";
import * as Slack from "@thomasfosterau/effect-connect-slack";

const ChatLive = Slack.layer({
  webhookUrl: Redacted.make(process.env.SLACK_WEBHOOK_URL!),
}).pipe(Layer.provide(FetchHttpClient.layer));

const program = sendChat({ text: "Deploy finished" }).pipe(Effect.provide(ChatLive));
// result.id is always `none`: Slack answers `ok`, with no message id
```

The message is `{ text, username? }`. `text` is sent as Slack `mrkdwn`. `username` overrides the display name only on a legacy custom-integration webhook; a Slack-app webhook posts as the app and ignores it.

`Slack.layerConfig` reads `SLACK_WEBHOOK_URL` (redacted) through `effect/Config` and fails at layer construction with a `ConfigError` when it is unset or empty. On a Worker whose stages may lack the webhook, use `resolveTransport(env)` below.

## API

| Export | What it is |
| --- | --- |
| `layer(config)`, `layerConfig` | The `ChatService` over the `HttpClient` in context, from literal config or from `SLACK_WEBHOOK_URL`. |
| `resolveTransport(env)`, `configFromEnv(env)`, `SlackEnv` | Pick the live sender or the no-op from a Worker env; needs no `HttpClient`. |
| `noop` | The `ChatService` that succeeds without sending and logs one line naming neither the text nor the URL. |
| `SlackConfig`, `SlackConfigInput`, `DEFAULT_BASE_URL` | The webhook URL and request origin as a service. |
| `webhookPath` | The check every send runs: the path of a `https://hooks.slack.com/services/…` URL, `none` for anything else. |
| `toSlackPayload`, `SlackWebhookPayload` | The core-message → webhook-body mapping. |
| `layerChatService` | The `ChatService` over a `SlackConfig` and `HttpClient` you provide yourself. |

## On a Worker: `resolveTransport(env)`

```ts
import * as Effect from "effect/Effect";
import type { ChatService } from "@thomasfosterau/effect-connect";
import * as Slack from "@thomasfosterau/effect-connect-slack";

// Your request handler; it posts through the ChatService in context.
declare const handle: (request: Request) => Effect.Effect<Response, never, ChatService>;

export default {
  fetch: (request: Request, env: Slack.SlackEnv) =>
    handle(request).pipe(Effect.provide(Slack.resolveTransport(env)), Effect.runPromise),
};
```

The live sender is used when `SLACK_WEBHOOK_URL` is bound and non-blank (as a string or a `Redacted`); otherwise `Slack.noop`, which succeeds without sending and logs one line. A bound URL that is not Slack's still selects the live sender, whose every send then fails: a misconfiguration is loud. The no-op is only safe while the message is advisory.

## What the transport pins

- **The webhook URL is the credential.** Anyone holding it can post to the channel. It is `Redacted`, and it never appears in a log line or an error message: Effect's own `HttpClientError` message names the request URL, so errors are composed without it, the URL is redacted from any vendor or transport text they quote, and no error carries the request as its `cause`.
- **The URL is checked before any request.** It must be `https:`, on exactly `hooks.slack.com` with no port, userinfo, query or fragment, with a `/services/<a>/<b>/<c>` path. Anything else fails with `ChatSendError` (`status: none`) and nothing is sent.
- **A fixed literal origin.** The request goes to `https://hooks.slack.com` plus the checked path. `baseUrl` replaces only that origin, for a stub server in a test, never for request input; it has no environment variable.
- **`redirect: "error"`** on the underlying fetch, layered over any `FetchHttpClient.RequestInit` defaults you provide, so a 3xx can never replay the token-bearing request to another host.
- **Truncated error bodies.** A non-2xx becomes a `ChatSendError` with `provider: "slack"`, `status: some(status)` and at most 200 characters of the response (Slack's error string, such as `no_service` or `invalid_payload`); an unreadable body still fails with the status; a transport failure carries `status: none`.
- **No retry.** The caller decides the policy (`Effect.retry`).
- **Batches are sent in order, one at a time.** A webhook has no batch endpoint, and a channel shows messages in the order they arrive, so `sendBatch` posts each message after the last and fails on the first failure.

## License

MIT
