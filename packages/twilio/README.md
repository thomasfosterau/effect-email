# `@thomasfosterau/effect-connect-twilio`

The Twilio SMS and WhatsApp provider for [`@thomasfosterau/effect-connect`](https://github.com/thomasfosterau/effect-connect/tree/trunk/packages/core#readme): Programmable Messaging (`POST /2010-04-01/Accounts/{AccountSid}/Messages.json`) over Effect's `HttpClient` (`effect/http`) with no SDK, a `Redacted` auth token, a no-op layer per channel for un-provisioned stages and env-driven resolvers that pick between the two. It implements the core's `SmsService` and `WhatsAppService`.

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

## WhatsApp

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/http";
import { WhatsAppService } from "@thomasfosterau/effect-connect";
import * as Twilio from "@thomasfosterau/effect-connect-twilio";

const config = {
  accountSid: process.env.TWILIO_ACCOUNT_SID!,
  authToken: Redacted.make(process.env.TWILIO_AUTH_TOKEN!),
  from: "Example", // the SMS sender: never used for WhatsApp
  whatsappFrom: "+61400000001", // a number registered as a WhatsApp sender
};

// Both channels from one configuration.
const MessagingLive = Layer.mergeAll(Twilio.layer(config), Twilio.layerWhatsApp(config)).pipe(
  Layer.provide(FetchHttpClient.layer),
);

const program = Effect.gen(function* () {
  const whatsapp = yield* WhatsAppService;
  // Outside the 24-hour customer-service window: a pre-approved template.
  yield* whatsapp.send({
    _tag: "Template",
    to: "+61412345678",
    template: { id: "HX…", variables: { "1": "123456" } },
  });
  // Inside it: free-form text.
  yield* whatsapp.send({ _tag: "Text", to: "+61412345678", body: "Thanks, we're on it." });
});
```

WhatsApp goes through the same Messages resource and the same request path as SMS, so every transport property below applies to it too. `To` and `From` are sent with the `whatsapp:` prefix (a configured `whatsappFrom` may carry it already); a text message becomes `Body`; a template becomes `ContentSid` (the template's `id`, Twilio's `HX…` Content SID) and `ContentVariables` (its `variables`, JSON-encoded; omitted when there are none).

**WhatsApp senders.** A message's own `from` wins over `whatsappFrom` (`TWILIO_WHATSAPP_FROM`). The SMS `from` is never used: an alphanumeric sender ID or short code is not a WhatsApp number. A configured `messagingServiceSid` is sent with WhatsApp messages too, so with no WhatsApp `from` Twilio picks a sender from the service's pool; that pool must hold a WhatsApp sender, or Twilio rejects the send. A send with neither fails with `WhatsAppSendError` before any request.

**API keys.** Twilio recommends API keys over the account auth token. Set `apiKeySid: "SK…"` and pass the key's secret as `authToken`; the request still names the account SID in its path.

`Twilio.layerConfig` (SMS) and `Twilio.layerWhatsAppConfig` (WhatsApp) read the same settings through `effect/Config`: `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` (required) and the optional `TWILIO_API_KEY_SID`, `TWILIO_FROM`, `TWILIO_WHATSAPP_FROM`, `TWILIO_MESSAGING_SERVICE_SID` and `TWILIO_BASE_URL`. It fails at layer construction with a `ConfigError` when a required variable is unset or empty; an empty optional variable reads as unset. On a Worker whose stages may lack the credentials, use `resolveTransport(env)` / `resolveWhatsAppTransport(env)` below.

## API

| Export | What it is |
| --- | --- |
| `layer(config)`, `layerConfig` | The `SmsService` over the `HttpClient` in context, from literal config or from the `TWILIO_*` variables. |
| `layerWhatsApp(config)`, `layerWhatsAppConfig` | The `WhatsAppService`, likewise. Merge with `layer(config)` to provide both channels. |
| `resolveTransport(env)`, `resolveWhatsAppTransport(env)`, `configFromEnv(env)`, `TwilioEnv` | Pick the live sender or the no-op from a Worker env, per channel; needs no `HttpClient`. |
| `noop`, `noopWhatsApp` | The `SmsService` / `WhatsAppService` that succeeds without sending and logs one line naming neither the recipient, the body nor a template's variables. |
| `TwilioConfig`, `TwilioConfigInput`, `DEFAULT_BASE_URL` | The account, credential, default senders (`from` for SMS, `whatsappFrom` for WhatsApp) and host as a service. |
| `toTwilioParams`, `TwilioMessageParams`, `TwilioSenderDefaults` | The core-SMS → form-field mapping (`none` when there is no sender). |
| `toTwilioWhatsAppParams`, `TwilioWhatsAppParams` | The core-WhatsApp → form-field mapping (`whatsapp:` prefixes, `Body` or `ContentSid` + `ContentVariables`; `none` when there is no sender). |
| `layerSmsService`, `layerWhatsAppService` | The `SmsService` / `WhatsAppService` over a `TwilioConfig` and `HttpClient` you provide yourself. |

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

The live sender is used when `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are both bound and non-blank (the token as a string or a `Redacted`); otherwise `Twilio.noop`, which succeeds without sending. It logs neither the number (PII) nor the body (an SMS is very often a one-time code). That trade is only safe while the SMS is advisory: a send that gates an account should fail loudly at boot instead. `resolveWhatsAppTransport(env)` is the same for WhatsApp, falling back on `Twilio.noopWhatsApp`, which logs neither the number, the body nor a template's variables.

## What the transport pins

- **A fixed literal host.** `https://api.twilio.com` is a compile-time constant; `baseUrl` exists for a stub server in a test, never for request input. The account SID is checked against `AC` + 32 hex digits before it reaches the URL path, so a misconfigured value can never steer the request elsewhere.
- **`redirect: "error"`** on the underlying fetch, layered over any `FetchHttpClient.RequestInit` defaults you provide, so a 3xx can never replay the Basic credential to another host.
- **Truncated error bodies.** A non-2xx becomes an `SmsSendError` (`WhatsAppSendError` for WhatsApp) with `provider: "twilio"`, `status: some(status)` and at most 200 characters of the response; an unreadable body still fails with the status; a transport failure, or a send refused before any request, carries `status: none`. The token never appears in a message.
- **No retry.** The caller decides the policy (`Effect.retry`).
- **Batches are sent a message at a time.** Twilio has no batch endpoint, so `sendBatch` sends each message on its own, four in flight at once, and fails on the first failure.

## License

MIT
