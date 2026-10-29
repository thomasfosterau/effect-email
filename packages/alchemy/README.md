# `@thomasfosterau/effect-connect-alchemy`

Deploy-time bindings for [`@thomasfosterau/effect-connect`](https://github.com/thomasfosterau/effect-connect/tree/trunk/packages/core#readme) on Cloudflare Workers deployed with [Alchemy](https://alchemy.run). Each builder returns the record of Worker `env` bindings one provider reads, under that provider's own keys (`RESEND_API_KEY`, `TWILIO_*`, …). Secrets are `Redacted` values, which Alchemy deploys as secret bindings, and unset optional values are left out of the record. Spread the record into your Worker's `env`, and the provider's `resolveTransport(env)` (or `layerConfig`) finds its credentials at runtime.

It binds credentials only. It provisions nothing on the vendor's side (domains, API keys, Messaging Services), and it imports nothing from `alchemy`: the builders need only `effect`.

This package was created using Claude Code, and its API is in flux: expect churn and breaking changes.

## Install

```bash
pnpm add -D @thomasfosterau/effect-connect-alchemy effect
```

`effect` (`>=4.0.0-rc.118`) is a required peer dependency; `alchemy` (`>=2.0.0-beta.80`) is an optional one. Node.js 22 or newer is required. The package runs on the deploy machine, inside your `alchemy.run.ts`, never in the Worker.

## Usage

On the deploy machine, build the bindings and pass them into the Worker's `env`:

```ts skip-type-checking
import * as Redacted from "effect/Redacted";
import { resendBindings, twilioBindings } from "@thomasfosterau/effect-connect-alchemy";

const env = {
  ...resendBindings({ apiKey: Redacted.make(process.env.RESEND_API_KEY!) }),
  ...twilioBindings({
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: Redacted.make(process.env.TWILIO_AUTH_TOKEN!),
    from: process.env.TWILIO_FROM, // left out when unset or blank
  }),
};
// …then `env` in your Worker resource's props.
```

Or read the same names through `effect/Config` on the deploy machine, with the `…BindingsConfig` forms. Each one is a `Config` of the whole record. It fails when a required value is missing, and it leaves out optional values that are unset or empty:

```ts skip-type-checking
import * as Effect from "effect/Effect";
import { resendBindingsConfig, twilioBindingsConfig } from "@thomasfosterau/effect-connect-alchemy";

const env = Effect.gen(function* () {
  return { ...(yield* resendBindingsConfig), ...(yield* twilioBindingsConfig) };
});
```

In the Worker, the provider reads them back:

```ts skip-type-checking
import * as Resend from "@thomasfosterau/effect-connect-resend";

const EmailLive = Resend.resolveTransport(env); // the live sender: RESEND_API_KEY is bound
```

## API

| Export | Binds | Read at runtime by |
| --- | --- | --- |
| `resendBindings`, `resendBindingsConfig`, `ResendBindings`, `ResendBindingsInput` | `RESEND_API_KEY` (secret) | `effect-connect-resend`'s `resolveTransport(env)` (`ResendEnv`) |
| `sendGridBindings`, `sendGridBindingsConfig`, `SendGridBindings`, `SendGridBindingsInput` | `SENDGRID_API_KEY` (secret) | `effect-connect-sendgrid`'s `layerConfig` |
| `twilioBindings`, `twilioBindingsConfig`, `TwilioBindings`, `TwilioBindingsInput` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (secret); optional `TWILIO_API_KEY_SID`, `TWILIO_FROM`, `TWILIO_WHATSAPP_FROM`, `TWILIO_MESSAGING_SERVICE_SID` | `effect-connect-twilio`'s `resolveTransport(env)` / `resolveWhatsAppTransport(env)` (`TwilioEnv`) |
| `vonageBindings`, `vonageBindingsConfig`, `VonageBindings`, `VonageBindingsInput` | `VONAGE_API_KEY`, `VONAGE_API_SECRET` (secret); optional `VONAGE_FROM` | `effect-connect-vonage`'s `resolveTransport(env)` (`VonageEnv`) |
| `slackBindings`, `slackBindingsConfig`, `SlackBindings`, `SlackBindingsInput` | `SLACK_WEBHOOK_URL` (secret) | `effect-connect-slack`'s `resolveTransport(env)` (`SlackEnv`) |
| `discordBindings`, `discordBindingsConfig`, `DiscordBindings`, `DiscordBindingsInput` | `DISCORD_WEBHOOK_URL` (secret) | `effect-connect-discord`'s `resolveTransport(env)` (`DiscordEnv`) |
| `Deployed<B>` | — | The `env` a Worker receives for a bindings record `B`: every value a plain string. Each provider's env type accepts it. |

`Deployed<B>` is the same type `Cloudflare.InferEnv` (from `@alchemy.run/cloudflare`) gives a Worker whose `env` is `B`; the package's tests assert that for every builder against `@alchemy.run/cloudflare` 2.0.0-beta.84.

## Why optional values are left out

Alchemy deploys a value that resolves to `undefined` as a JSON binding, not as an absent one. A blank string bound as plain text would arrive as `""`. Every provider's resolver already treats a blank binding as absent. Even so, the builders never deploy either: an unset or blank optional value is simply not a key of the record.

## License

MIT
