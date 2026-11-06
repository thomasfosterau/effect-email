# `@thomasfosterau/effect-connect-alchemy-cloudflare`

Deploy-time bindings for [`@thomasfosterau/effect-connect`](https://github.com/thomasfosterau/effect-connect/tree/trunk/packages/core#readme) on Cloudflare Workers deployed with [Alchemy](https://alchemy.run)'s Cloudflare provider, [`@alchemy.run/cloudflare`](https://www.npmjs.com/package/@alchemy.run/cloudflare). Each builder returns the record of Worker `env` bindings one provider reads, under that provider's own keys (`RESEND_API_KEY` for Resend, the one provider today). Secrets are `Redacted` values, which Alchemy deploys as secret bindings. Spread the record into your Worker's `env`, and the provider's `resolveTransport(env)` (or `layerConfig`) finds its credentials at runtime.

It binds credentials only. It provisions nothing on the vendor's side (domains, API keys). Its types are the Cloudflare provider's: every bindings record is a `WorkerBindings` (each value a `Cloudflare.WorkerBindingResource`), and `Deployed<B>` is `Cloudflare.InferEnv<B>`. At runtime the builders need only `effect`.

This package was created using Claude Code, and its API is in flux: expect churn and breaking changes.

## Install

```bash
pnpm add -D @thomasfosterau/effect-connect-alchemy-cloudflare @alchemy.run/cloudflare@2.0.0-beta.85 alchemy@2.0.0-beta.85 effect
```

Its peer dependencies are all required: `@alchemy.run/cloudflare` and `alchemy`, exactly `2.0.0-beta.85` (the provider peers on that exact `alchemy`), and `effect` `^4.1.0`, the range both of them require. Node.js 22 or newer is required. The package runs on the deploy machine, inside your `alchemy.run.ts`, never in the Worker.

## Usage

On the deploy machine, build the bindings and pass them into the Worker's `env`:

```ts skip-type-checking
import * as Redacted from "effect/Redacted";
import { resendBindings } from "@thomasfosterau/effect-connect-alchemy-cloudflare";

const env = {
  ...resendBindings({ apiKey: Redacted.make(process.env.RESEND_API_KEY!) }),
};
// …then `env` in your Worker resource's props.
```

Or read the same names through `effect/Config` on the deploy machine, with the `…BindingsConfig` forms. Each one is a `Config` of the whole record, and fails when a required value is missing:

```ts skip-type-checking
import * as Effect from "effect/Effect";
import { resendBindingsConfig } from "@thomasfosterau/effect-connect-alchemy-cloudflare";

const env = Effect.gen(function* () {
  return { ...(yield* resendBindingsConfig) };
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
| `WorkerBindings<B>` | — | The constraint every bindings record meets: each value a `Cloudflare.WorkerBindingResource`, so the record spreads into a `Cloudflare.Worker`'s `env`. |
| `Deployed<B>` | — | `Cloudflare.InferEnv<B>`: the `env` a Worker receives for a bindings record `B`, every value a plain string. Each provider's env type accepts it. |

`Deployed<B>` is defined as the provider's own `Cloudflare.InferEnv<B>`, so a Worker typed with it is checked against the env Alchemy actually deploys; the package's tests assert, for every builder against `@alchemy.run/cloudflare` 2.0.0-beta.85, that it is also what `InferEnv` gives a `Cloudflare.Worker` whose `env` is `B`, and that the provider's env type accepts it.

## License

MIT
