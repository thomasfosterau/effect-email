# `@thomasfosterau/effect-connect-vonage`

The Vonage SMS provider for [`@thomasfosterau/effect-connect`](https://github.com/thomasfosterau/effect-connect/tree/trunk/packages/core#readme): the Messages API (`POST https://api.nexmo.com/v1/messages`, `channel: "sms"`) over Effect's `HttpClient` (`effect/http`) with no SDK, a `Redacted` API secret, a no-op layer for un-provisioned stages and an env-driven resolver that picks between the two.

This package was created using Claude Code, and its API is in flux: expect churn and breaking changes.

## Install

```bash
pnpm add @thomasfosterau/effect-connect-vonage @thomasfosterau/effect-connect effect
```

`effect` (`>=4.0.0-rc.118`) is a required peer dependency. Node.js 22 or newer is required. Nothing here is Node-shaped: the provider runs on Cloudflare Workers and in browsers as well as on Node.

## Usage

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/http";
import { SmsService } from "@thomasfosterau/effect-connect";
import * as Vonage from "@thomasfosterau/effect-connect-vonage";

const SmsLive = Vonage.layer({
  apiKey: process.env.VONAGE_API_KEY!,
  apiSecret: Redacted.make(process.env.VONAGE_API_SECRET!),
  from: "+61400000000", // or an alphanumeric sender ID such as "Example"
}).pipe(Layer.provide(FetchHttpClient.layer));

const program = Effect.gen(function* () {
  const sms = yield* SmsService;
  const result = yield* sms.send({ to: "+61412345678", body: "Your code is 123456" });
  // result.id is Vonage's message_uuid, as an Option (always `some` here)
});
```

**Senders.** A message's own `from` wins over the configured `from`. A send with neither fails with `SmsSendError` before any request.

**Numbers.** The core speaks E.164 (`+61412345678`); Vonage takes the digits without the `+`, so the provider strips it from `to` and from an E.164 `from`. An alphanumeric sender ID or a short code goes out unchanged.

**Credentials.** The API key and secret are sent as HTTP Basic auth in the `Authorization` header, never in the request body.

`Vonage.layerConfig` reads the same settings through `effect/Config`: `VONAGE_API_KEY` and `VONAGE_API_SECRET` (required) and the optional `VONAGE_FROM` and `VONAGE_BASE_URL`. It fails at layer construction with a `ConfigError` when a required variable is unset or empty; an empty optional variable reads as unset. On a Worker whose stages may lack the credentials, use `resolveTransport(env)` below.

## API

| Export | What it is |
| --- | --- |
| `layer(config)`, `layerConfig` | The `SmsService` over the `HttpClient` in context, from literal config or from the `VONAGE_*` variables. |
| `resolveTransport(env)`, `configFromEnv(env)`, `VonageEnv` | Pick the live sender or the no-op from a Worker env; needs no `HttpClient`. |
| `noop` | The `SmsService` that succeeds without sending and logs one line naming neither the recipient nor the body. |
| `VonageConfig`, `VonageConfigInput`, `DEFAULT_BASE_URL` | The credential, default sender and host as a service. |
| `toVonagePayload`, `VonageMessagePayload`, `toVonageNumber` | The core-message → JSON-body mapping (`none` when there is no sender) and the `+`-stripping number form. |
| `layerSmsService` | The `SmsService` over a `VonageConfig` and `HttpClient` you provide yourself. |

## On a Worker: `resolveTransport(env)`

```ts
import * as Effect from "effect/Effect";
import type { SmsService } from "@thomasfosterau/effect-connect";
import * as Vonage from "@thomasfosterau/effect-connect-vonage";

// Your request handler; it sends through the SmsService in context.
declare const handle: (request: Request) => Effect.Effect<Response, never, SmsService>;

export default {
  fetch: (request: Request, env: Vonage.VonageEnv) =>
    handle(request).pipe(Effect.provide(Vonage.resolveTransport(env)), Effect.runPromise),
};
```

The live sender is used when `VONAGE_API_KEY` and `VONAGE_API_SECRET` are both bound and non-blank (the secret as a string or a `Redacted`); otherwise `Vonage.noop`, which succeeds without sending. It logs neither the number (PII) nor the body (an SMS is very often a one-time code). That trade is only safe while the SMS is advisory: a send that gates an account should fail loudly at boot instead.

## What the transport pins

- **A fixed literal host and path.** `https://api.nexmo.com/v1/messages`; `baseUrl` exists for a stub server in a test, never for request input. No configured value reaches the URL path.
- **`redirect: "error"`** on the underlying fetch, layered over any `FetchHttpClient.RequestInit` defaults you provide, so a 3xx can never replay the Basic credential to another host.
- **Truncated error bodies.** A non-2xx becomes an `SmsSendError` with `provider: "vonage"`, `status: some(status)` and at most 200 characters of the response; an unreadable body still fails with the status; a transport failure, or a send refused before any request, carries `status: none`. The secret never appears in a message.
- **No retry.** The caller decides the policy (`Effect.retry`).
- **Batches are sent a message at a time.** The Messages API has no batch endpoint, so `sendBatch` sends each message on its own, four in flight at once, and fails on the first failure.

## License

MIT
