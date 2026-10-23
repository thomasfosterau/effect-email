/**
 * Choosing a provider's transport at a Worker's edge: reading the Worker's
 * `env` bindings, picking the live layer or the no-op, and the no-op sender
 * itself. Every provider's `configFromEnv` / `resolveTransport(env)` / `noop`
 * is built from these, so the rules are stated once:
 *
 * - a blank binding is the same case as an absent one, never a transport
 *   built around an empty credential;
 * - a secret may arrive as a plain string (a local `.dev.vars`) or already
 *   `Redacted` (alchemy wraps it);
 * - the live layer runs on the platform `fetch` (`FetchHttpClient`), so the
 *   resolved layer needs nothing from the caller;
 * - the no-op succeeds without sending and logs one line per message, which
 *   the provider words so that it names no recipient and no body.
 *
 * @module Transport
 * @since 0.1.0
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Str from "effect/String";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import type * as HttpClient from "effect/http/HttpClient";

/* oxlint-disable effect/prefer-option-over-null -- a Cloudflare-materialised Worker `env`: an unbound secret arrives as a missing key (or a stage binds `null`), and a stage can bind it as a plain string or a `Redacted`. These types name that shape once; `boundString` / `boundSecret` are the adapters onto `Option`. */
/**
 * A plain Worker `env` binding as it arrives: a string, or absent.
 *
 * @since 0.1.0
 */
export type EnvBinding = string | null | undefined;

/**
 * A secret Worker `env` binding as it arrives: a plain string, an already
 * `Redacted` one, or absent.
 *
 * @since 0.1.0
 */
export type EnvSecretBinding = string | Redacted.Redacted<string> | null | undefined;
/* oxlint-enable effect/prefer-option-over-null */

/**
 * A plain binding as `some` when present and non-blank, else `none`.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Option from "effect/Option";
 * import { boundString } from "@thomasfosterau/effect-connect";
 *
 * assert.deepStrictEqual(boundString("+61400000000"), Option.some("+61400000000"));
 * assert.deepStrictEqual(boundString("  "), Option.none());
 * assert.deepStrictEqual(boundString(undefined), Option.none());
 * ```
 *
 * @since 0.1.0
 */
export const boundString = (value: EnvBinding): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(value), (raw) => Str.isNonEmpty(raw.trim()));

/**
 * A secret binding as `some(Redacted)` when present and non-blank, else
 * `none`. A plain string is wrapped; an already `Redacted` one is kept.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Option from "effect/Option";
 * import * as Redacted from "effect/Redacted";
 * import { boundSecret } from "@thomasfosterau/effect-connect";
 *
 * assert.deepStrictEqual(Option.map(boundSecret("re_key"), Redacted.value), Option.some("re_key"));
 * assert.ok(Option.isNone(boundSecret(Redacted.make(" "))));
 * assert.ok(Option.isNone(boundSecret(null)));
 * ```
 *
 * @since 0.1.0
 */
export const boundSecret = (value: EnvSecretBinding): Option.Option<Redacted.Redacted<string>> =>
  Option.flatMap(Option.fromNullishOr(value), (raw) => {
    const secret = Redacted.isRedacted(raw) ? raw : Redacted.make(raw);
    return Str.isEmpty(Redacted.value(secret).trim()) ? Option.none() : Option.some(secret);
  });

/**
 * The live layer, on the platform `fetch`, when `config` is `some`, else
 * `fallback` (a provider's no-op). One call site per Worker, so the fallback
 * cannot be forgotten at one of two.
 *
 * @since 0.1.0
 */
export const selectTransport = <C, S>(
  config: Option.Option<C>,
  live: (config: C) => Layer.Layer<S, never, HttpClient.HttpClient>,
  fallback: Layer.Layer<S>,
): Layer.Layer<S> =>
  Option.match(config, {
    onNone: () => fallback,
    onSome: (value) => live(value).pipe(Layer.provide(FetchHttpClient.layer)),
  });

/**
 * A channel's `send` / `sendBatch` that succeed without sending: each message
 * logs one warning (`line(message)`) and answers `{ id: none }`; a batch is
 * dropped one message at a time. The provider writes the line, and it must
 * name neither the recipient (PII) nor the body (a verification URL or a
 * one-time code is the secret): it exists only to answer "is this channel
 * being dropped for want of a credential?".
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Effect from "effect/Effect";
 * import * as Option from "effect/Option";
 * import { droppingSender, type SmsMessage } from "@thomasfosterau/effect-connect";
 *
 * const sender = droppingSender<SmsMessage>(() => "[example] no credentials; dropping an SMS");
 * const result = Effect.runSync(sender.send({ to: "+61412345678", body: "Your code is 123456" }));
 *
 * assert.ok(Option.isNone(result.id));
 * ```
 *
 * @since 0.1.0
 */
export const droppingSender = <M>(line: (message: M) => string) => {
  const dropOne = (message: M): Effect.Effect<{ readonly id: Option.Option<string> }> =>
    Effect.as(Effect.logWarning(line(message)), { id: Option.none() });
  return {
    send: dropOne,
    sendBatch: (messages: ReadonlyArray<M>) =>
      Effect.forEach(messages, dropOne, { concurrency: 1 }),
  };
};
