# effect-email

An Effect-native email abstraction, published as three npm packages: a provider-agnostic core and two providers that talk HTTP through `effect/http`, so they run on Cloudflare Workers, browsers and Node alike, with no vendor SDK.

| Package | What it is |
| --- | --- |
| [`@thomasfosterau/effect-email`](packages/core/README.md) | The core: the message model (`effect/Schema`), the `EmailService` contract (`Context.Service`), its errors and a recording test layer. Provider-agnostic. |
| [`@thomasfosterau/effect-email-sendgrid`](packages/sendgrid/README.md) | The SendGrid provider: the v3 Mail Send API with request batching, plus a typed client for the Templates, Marketing Contacts, API Keys and User Profile resources. Absorbs the former `thomasfosterau/effect-sendgrid`. |
| [`@thomasfosterau/effect-email-resend`](packages/resend/README.md) | The Resend provider: `POST /emails` with a `Redacted` key, a no-op layer for un-provisioned stages and a Worker env resolver. |

The API is in flux: expect breaking changes before 1.0.

## Install

```bash
pnpm add @thomasfosterau/effect-email @thomasfosterau/effect-email-resend effect
# or the SendGrid provider:
pnpm add @thomasfosterau/effect-email @thomasfosterau/effect-email-sendgrid effect
```

`effect` (`>=4.0.0-rc.118`) is a peer dependency. Node.js 22 or newer.

## Example

Code sends through `EmailService`; the edge provides one provider's layer. Swapping providers is a one-line layer change, and a test provides `EmailService.layerRecording` instead.

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/http";
import { EmailService } from "@thomasfosterau/effect-email";
import * as Resend from "@thomasfosterau/effect-email-resend";

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

Each package README is its API reference; start with the [core](packages/core/README.md).

## Development

pnpm + Vite+ (`vp`), with fallow for dead-code and complexity audits and Changesets for releases. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, hooks and the individual checks, [PUBLISHING.md](PUBLISHING.md) for the release pipeline, [SECURITY.md](SECURITY.md) for reporting a vulnerability, and [AGENTS.md](AGENTS.md) for the guidance coding agents follow.

## License

[MIT](LICENSE)
