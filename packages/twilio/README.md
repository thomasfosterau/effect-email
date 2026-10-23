# `@thomasfosterau/effect-connect-twilio`

The Twilio SMS provider for [`@thomasfosterau/effect-connect`](https://github.com/thomasfosterau/effect-connect/tree/trunk/packages/core#readme): Programmable Messaging (`POST /2010-04-01/Accounts/{AccountSid}/Messages.json`) over Effect's `HttpClient` (`effect/http`) with no SDK, a `Redacted` auth token, a no-op layer for un-provisioned stages and an env-driven resolver that picks between the two.

This package was created using Claude Code, and its API is in flux: expect churn and breaking changes.

## Install

```bash
pnpm add @thomasfosterau/effect-connect-twilio @thomasfosterau/effect-connect effect
```

`effect` (`>=4.0.0-rc.118`) is a required peer dependency. Node.js 22 or newer is required. Nothing here is Node-shaped: the provider runs on Cloudflare Workers and in browsers as well as on Node.

## Usage

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/http";
import { SmsService } from "@thomasfosterau/effect-connect";
import * as Twilio from "@thomasfosterau/effect-connect-twilio";

const SmsLive = Twilio.layer({
  accountSid: process.env.TWILIO_ACCOUNT_SID!,
  authToken: Redacted.make(process.env.TWILIO_AUTH_TOKEN!),
  from: "+61400000000", // or messagingServiceSid: "MG…"
}).pipe(Layer.provide(FetchHttpClient.layer));

const program = Effect.gen(function* () {
  const sms = yield* SmsService;
  const result = yield* sms.send({ to: "+61412345678", body: "Your code is 123456" });
  // result.id is Twilio's message SID (SM…), as an Option (always `some` here)
});
```

**Senders.** A message's own `from` wins over the configured `from`. A configured `messagingServiceSid` is sent on every request, so Twilio picks the sender from the service's pool when no `from` is set (and uses `From` when one is). A send with neither fails with `SmsSendError` before any request.

**API keys.** Twilio recommends API keys over the account auth token. Set `apiKeySid: "SK…"` and pass the key's secret as `authToken`; the request still names the account SID in its path.

`Twilio.layerConfig` reads the same settings through `effect/Config`: `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` (required) and the optional `TWILIO_API_KEY_SID`, `TWILIO_FROM`, `TWILIO_MESSAGING_SERVICE_SID` and `TWILIO_BASE_URL`. It fails at layer construction with a `ConfigError` when a required variable is unset or empty; an empty optional variable reads as unset. On a Worker whose stages may lack the credentials, use `resolveTransport(env)` below.

## API

| Export | What it is |
| --- | --- |
| `layer(config)`, `layerConfig` | The `SmsService` over the `HttpClient` in context, from literal config or from the `TWILIO_*` variables. |
| `resolveTransport(env)`, `configFromEnv(env)`, `TwilioEnv` | Pick the live sender or the no-op from a Worker env; needs no `HttpClient`. |
| `noop` | The `SmsService` that succeeds without sending and logs one line naming neither the recipient nor the body. |
| `TwilioConfig`, `TwilioConfigInput`, `DEFAULT_BASE_URL` | The account, credential, default sender and host as a service. |
| `toTwilioParams`, `TwilioMessageParams`, `TwilioSenderDefaults` | The core-message → form-field mapping (`none` when there is no sender). |
| `layerSmsService` | The `SmsService` over a `TwilioConfig` and `HttpClient` you provide yourself. |

## On a Worker: `resolveTransport(env)`

```ts
import * as Effect from "effect/Effect";
import type { SmsService } from "@thomasfosterau/effect-connect";
import * as Twilio from "@thomasfosterau/effect-connect-twilio";

// Your request handler; it sends through the SmsService in context.
declare const handle: (request: Request) => Effect.Effect<Response, never, SmsService>;

export default {
  fetch: (request: Request, env: Twilio.TwilioEnv) =>
    handle(request).pipe(Effect.provide(Twilio.resolveTransport(env)), Effect.runPromise),
};
```

The live sender is used when `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are both bound and non-blank (the token as a string or a `Redacted`); otherwise `Twilio.noop`, which succeeds without sending. It logs neither the number (PII) nor the body (an SMS is very often a one-time code). That trade is only safe while the SMS is advisory: a send that gates an account should fail loudly at boot instead.

## What the transport pins

- **A fixed literal host.** `https://api.twilio.com` is a compile-time constant; `baseUrl` exists for a stub server in a test, never for request input. The account SID is checked against `AC` + 32 hex digits before it reaches the URL path, so a misconfigured value can never steer the request elsewhere.
- **`redirect: "error"`** on the underlying fetch, layered over any `FetchHttpClient.RequestInit` defaults you provide, so a 3xx can never replay the Basic credential to another host.
- **Truncated error bodies.** A non-2xx becomes an `SmsSendError` with `provider: "twilio"`, `status: some(status)` and at most 200 characters of the response; an unreadable body still fails with the status; a transport failure, or a send refused before any request, carries `status: none`. The token never appears in a message.
- **No retry.** The caller decides the policy (`Effect.retry`).
- **Batches are sent a message at a time.** Twilio has no batch endpoint, so `sendBatch` sends each message on its own, four in flight at once, and fails on the first failure.

## License

MIT
