# effect-connect

An Effect-native messaging abstraction over email, SMS, WhatsApp and chat, published as three npm packages: a provider-agnostic core with one service per channel, and providers that talk HTTP through `effect/http`, so they run on Cloudflare Workers, browsers and Node alike, with no vendor SDK.

| Package | What it is |
| --- | --- |
| [`@thomasfosterau/effect-connect`](packages/core/README.md) | The core: per-channel message models (`effect/Schema`), the `EmailService`, `SmsService`, `WhatsAppService` and `ChatService` contracts (`Context.Service`), their errors and recording test layers. Provider-agnostic. |
| [`@thomasfosterau/effect-connect-resend`](packages/resend/README.md) | The Resend email provider: `POST /emails` with a `Redacted` key, a no-op layer for un-provisioned stages and a Worker env resolver. |
| [`@thomasfosterau/effect-connect-alchemy`](packages/alchemy/README.md) | Deploy-time bindings for Workers deployed with Alchemy: one builder per provider (Resend today) of the `env` record its resolver reads, secrets as `Redacted`. Depends on `effect` only. |

The API is in flux: expect breaking changes before 1.0.

## Install

```bash
pnpm add @thomasfosterau/effect-connect @thomasfosterau/effect-connect-resend effect
```

`effect` (`^4.0.0`) is a peer dependency. Node.js 22 or newer.

## Example

Code sends through a channel's service (`EmailService`, `SmsService`, `WhatsAppService`, `ChatService`); the edge provides one provider's layer per channel. Swapping providers is a one-line layer change, and a test provides `EmailService.layerRecording` / `SmsService.layerRecording` instead.

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

SMS, WhatsApp and chat are channels of their own, each with its own service (`SmsService`, `WhatsAppService`, `ChatService`). They are contracts only: no provider in this repository implements them yet, so provide your own layer for each (or its `layerRecording` in a test). A program that uses two channels names both in its requirements:

```ts
import * as Effect from "effect/Effect";
import { sendSms, sendWhatsApp, SmsService, WhatsAppService } from "@thomasfosterau/effect-connect";

const notify = (to: string) =>
  Effect.all([
    sendSms({ to, body: "Your order has shipped" }),
    // A WhatsApp message is free-form text (`_tag: "Text"`, only inside the
    // 24-hour customer-service window) or a pre-approved template.
    sendWhatsApp({
      _tag: "Template",
      to,
      template: { id: "shipped", variables: { "1": "#1042" } },
    }),
  ]);

Effect.runPromise(
  notify("+61412345678").pipe(
    Effect.provide(SmsService.layerRecording([])),
    Effect.provide(WhatsAppService.layerRecording([])),
  ),
);
```

Each package README is its API reference; start with the [core](packages/core/README.md).

## Development

pnpm + Vite+ (`vp`), with fallow for dead-code and complexity audits and Changesets for releases. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, hooks and the individual checks, [PUBLISHING.md](PUBLISHING.md) for the release pipeline, [SECURITY.md](SECURITY.md) for reporting a vulnerability, and [AGENTS.md](AGENTS.md) for the guidance coding agents follow.

## License

[MIT](LICENSE)
