# effect-connect

An Effect-native messaging abstraction over email and SMS, published as four npm packages: a provider-agnostic core with one service per channel, and providers that talk HTTP through `effect/http`, so they run on Cloudflare Workers, browsers and Node alike, with no vendor SDK.

| Package | What it is |
| --- | --- |
| [`@thomasfosterau/effect-connect`](packages/core/README.md) | The core: per-channel message models (`effect/Schema`), the `EmailService` and `SmsService` contracts (`Context.Service`), their errors and recording test layers. Provider-agnostic. |
| [`@thomasfosterau/effect-connect-sendgrid`](packages/sendgrid/README.md) | The SendGrid email provider: the v3 Mail Send API with request batching, plus a typed client for the Templates, Marketing Contacts, API Keys and User Profile resources. Absorbs the former `thomasfosterau/effect-sendgrid`. |
| [`@thomasfosterau/effect-connect-resend`](packages/resend/README.md) | The Resend email provider: `POST /emails` with a `Redacted` key, a no-op layer for un-provisioned stages and a Worker env resolver. |
| [`@thomasfosterau/effect-connect-twilio`](packages/twilio/README.md) | The Twilio SMS provider: Programmable Messaging with a `Redacted` auth token (or API key), a default sender or Messaging Service, a no-op layer and a Worker env resolver. |

The API is in flux: expect breaking changes before 1.0.

## Install

```bash
pnpm add @thomasfosterau/effect-connect @thomasfosterau/effect-connect-resend effect
# or the SendGrid provider:
pnpm add @thomasfosterau/effect-connect @thomasfosterau/effect-connect-sendgrid effect
# SMS, with the Twilio provider:
pnpm add @thomasfosterau/effect-connect @thomasfosterau/effect-connect-twilio effect
```

`effect` (`>=4.0.0-rc.118`) is a peer dependency. Node.js 22 or newer.

## Example

Code sends through a channel's service (`EmailService`, `SmsService`); the edge provides one provider's layer per channel. Swapping providers is a one-line layer change, and a test provides `EmailService.layerRecording` / `SmsService.layerRecording` instead.

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/http";
import { EmailService } from "@thomasfosterau/effect-connect";
import * as Resend from "@thomasfosterau/effect-connect-resend";

const sendWelcome = (to: string) =>
  Effect.gen(function* () {
    const email = yield* EmailService;
    return yield* email.send({
      from: { email: "noreply@example.com", name: "Example" },
      to: [{ email: to }],
      subject: "Welcome",
      text: "Welcome aboard.",
    });
  });

const EmailLive = Resend.layer({ apiKey: Redacted.make("re_…") }).pipe(
  Layer.provide(FetchHttpClient.layer),
);

Effect.runPromise(sendWelcome("reader@example.com").pipe(Effect.provide(EmailLive)));
```

SMS is the same pattern with its own service, so a program that uses both names both in its requirements:

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/http";
import { sendSms } from "@thomasfosterau/effect-connect";
import * as Twilio from "@thomasfosterau/effect-connect-twilio";

const sendCode = (to: string, code: string) => sendSms({ to, body: `Your code is ${code}` });

const SmsLive = Twilio.layer({
  accountSid: "AC…",
  authToken: Redacted.make("…"),
  from: "+61400000000",
}).pipe(Layer.provide(FetchHttpClient.layer));

Effect.runPromise(sendCode("+61412345678", "123456").pipe(Effect.provide(SmsLive)));
```

Each package README is its API reference; start with the [core](packages/core/README.md).

## Development

pnpm + Vite+ (`vp`), with fallow for dead-code and complexity audits and Changesets for releases. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, hooks and the individual checks, [PUBLISHING.md](PUBLISHING.md) for the release pipeline, [SECURITY.md](SECURITY.md) for reporting a vulnerability, and [AGENTS.md](AGENTS.md) for the guidance coding agents follow.

## License

[MIT](LICENSE)
