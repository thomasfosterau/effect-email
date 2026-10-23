# effect-connect

An Effect-native messaging abstraction over email, SMS, WhatsApp and chat, published as eight npm packages: a provider-agnostic core with one service per channel, and providers that talk HTTP through `effect/http`, so they run on Cloudflare Workers, browsers and Node alike, with no vendor SDK.

| Package | What it is |
| --- | --- |
| [`@thomasfosterau/effect-connect`](packages/core/README.md) | The core: per-channel message models (`effect/Schema`), the `EmailService`, `SmsService`, `WhatsAppService` and `ChatService` contracts (`Context.Service`), their errors and recording test layers. Provider-agnostic. |
| [`@thomasfosterau/effect-connect-sendgrid`](packages/sendgrid/README.md) | The SendGrid email provider: the v3 Mail Send API with request batching, plus a typed client for the Templates, Marketing Contacts, API Keys and User Profile resources. Absorbs the former `thomasfosterau/effect-sendgrid`. |
| [`@thomasfosterau/effect-connect-resend`](packages/resend/README.md) | The Resend email provider: `POST /emails` with a `Redacted` key, a no-op layer for un-provisioned stages and a Worker env resolver. |
| [`@thomasfosterau/effect-connect-twilio`](packages/twilio/README.md) | The Twilio SMS and WhatsApp provider: Programmable Messaging with a `Redacted` auth token (or API key), per-channel default senders or a Messaging Service, WhatsApp text and template messages, no-op layers and Worker env resolvers. |
| [`@thomasfosterau/effect-connect-vonage`](packages/vonage/README.md) | The Vonage SMS provider: the Messages API with a `Redacted` API secret, a default sender, a no-op layer and a Worker env resolver. |
| [`@thomasfosterau/effect-connect-slack`](packages/slack/README.md) | The Slack chat provider: an incoming webhook whose `Redacted` URL is checked against `hooks.slack.com` before any request, a no-op layer and a Worker env resolver. |
| [`@thomasfosterau/effect-connect-discord`](packages/discord/README.md) | The Discord chat provider: a channel webhook (`?wait=true`, so the result carries the message id) whose `Redacted` URL is checked against `discord.com` before any request, a no-op layer and a Worker env resolver. |
| [`@thomasfosterau/effect-connect-alchemy`](packages/alchemy/README.md) | Deploy-time bindings for Workers deployed with Alchemy: one builder per provider of the `env` record its resolver reads, secrets as `Redacted`, unset optional values left out. Depends on `effect` only. |

The API is in flux: expect breaking changes before 1.0.

## Install

```bash
pnpm add @thomasfosterau/effect-connect @thomasfosterau/effect-connect-resend effect
# or the SendGrid provider:
pnpm add @thomasfosterau/effect-connect @thomasfosterau/effect-connect-sendgrid effect
# SMS and WhatsApp, with the Twilio provider:
pnpm add @thomasfosterau/effect-connect @thomasfosterau/effect-connect-twilio effect
# or the Vonage SMS provider:
pnpm add @thomasfosterau/effect-connect @thomasfosterau/effect-connect-vonage effect
# chat, with the Slack or Discord provider:
pnpm add @thomasfosterau/effect-connect @thomasfosterau/effect-connect-slack effect
```

`effect` (`>=4.0.0-rc.118`) is a peer dependency. Node.js 22 or newer.

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

WhatsApp is a third channel with its own service. A message is either free-form text (`_tag: "Text"`, only inside WhatsApp's 24-hour customer-service window) or a pre-approved template (`_tag: "Template"`); Twilio implements it over the same Messages resource, from a WhatsApp sender configured separately from the SMS one:

```ts
import { sendWhatsApp } from "@thomasfosterau/effect-connect";

const notifyShipped = (to: string) =>
  sendWhatsApp({ _tag: "Template", to, template: { id: "HX…", variables: { "1": "#1042" } } });

const WhatsAppLive = Twilio.layerWhatsApp({
  accountSid: "AC…",
  authToken: Redacted.make("…"),
  whatsappFrom: "+61400000001",
}).pipe(Layer.provide(FetchHttpClient.layer));
```

Chat posts through an incoming webhook. The webhook URL is the credential, so it is `Redacted`, checked against the vendor's host before any request and never put in an error message:

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/http";
import { sendChat } from "@thomasfosterau/effect-connect";
import * as Discord from "@thomasfosterau/effect-connect-discord";

const ChatLive = Discord.layer({
  webhookUrl: Redacted.make("https://discord.com/api/webhooks/…/…"),
}).pipe(Layer.provide(FetchHttpClient.layer)); // or Slack.layer({ webhookUrl }) from effect-connect-slack

Effect.runPromise(sendChat({ text: "Deployed v1.2.3" }).pipe(Effect.provide(ChatLive)));
```

Each package README is its API reference; start with the [core](packages/core/README.md).

## Development

pnpm + Vite+ (`vp`), with fallow for dead-code and complexity audits and Changesets for releases. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, hooks and the individual checks, [PUBLISHING.md](PUBLISHING.md) for the release pipeline, [SECURITY.md](SECURITY.md) for reporting a vulnerability, and [AGENTS.md](AGENTS.md) for the guidance coding agents follow.

## License

[MIT](LICENSE)
