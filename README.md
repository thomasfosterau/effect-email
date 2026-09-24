# effect-email

An Effect-native email abstraction, published as three npm packages:

| Package | What it is |
| --- | --- |
| [`@thomasfosterau/effect-email`](packages/core/README.md) | The core: the message model (`effect/Schema`), the `EmailService` contract (`Context.Service`) and its errors. Provider-agnostic. Peer: `effect`. |
| [`@thomasfosterau/effect-email-sendgrid`](packages/sendgrid/README.md) | The SendGrid provider: the v3 Mail Send API over Effect's `HttpClient` with request batching, plus a typed client for the Templates, Marketing Contacts, API Keys and User Profile resources. Absorbs the former `thomasfosterau/effect-sendgrid`. |
| [`@thomasfosterau/effect-email-resend`](packages/resend/README.md) | The Resend provider: `POST /emails` over Effect's `HttpClient` with no SDK, a `Redacted` key, a no-op layer for un-provisioned stages and an env-driven resolver. |

Every provider talks HTTP through `effect/unstable/http`, so it runs on Cloudflare Workers, browsers and Node alike, and a unit suite stubs it at the `HttpClient` seam without ever reaching a vendor. Built against `effect@4.0.0-rc.115`.

**Disclaimer:** this repository and its packages have been created using Claude Code. The API is in flux; expect churn and breaking changes.

## Quick start

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/unstable/http";
import { EmailService } from "@thomasfosterau/effect-email";
import * as Resend from "@thomasfosterau/effect-email-resend";

const sendWelcome = (to: string) =>
  Effect.flatMap(EmailService, (email) =>
    email.send({
      from: { email: "noreply@example.com", name: "Example" },
      to: [{ email: to }],
      subject: "Welcome",
      text: "Welcome aboard.",
    }),
  );

const EmailLive = Resend.layer({ apiKey: Redacted.make(env.RESEND_API_KEY) }).pipe(
  Layer.provide(FetchHttpClient.layer),
);

Effect.runPromise(sendWelcome("reader@example.com").pipe(Effect.provide(EmailLive)));
```

Swapping providers is a one-line layer change; `EmailService.layerRecording(sent)` is the test double.

## Documentation

The three package `README.md`s are the API references; [AGENTS.md](AGENTS.md) carries repository conventions, [CONTRIBUTING.md](CONTRIBUTING.md) the pre-PR checklist, [PUBLISHING.md](PUBLISHING.md) and [SECURITY.md](SECURITY.md) the release pipeline.

The Resend provider is the library form of the hand-rolled senders in the `thomasfosterau/website`, `thomasfosterau/gardeneria` and `thomasfosterau/preferenceflow` applications; the core message is the rendered form of `@thomasfosterau/effect-auth`'s purpose-keyed `EmailMessage`, so an effect-auth adapter can be built on a provider from here (see the core README).
