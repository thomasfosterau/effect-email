/**
 * The binding builders against each provider's own env contract: every
 * builder's output, and the `Deployed` view of it a Worker receives (secrets
 * as plain strings), must be assignable to the provider's `…Env` type and be
 * read back as a live configuration by its resolver. The env alchemy itself
 * infers for a Worker bound with each record (`Cloudflare.InferEnv`) must be
 * that same `Deployed` view.
 */

import { describe, expect, it } from "@effect/vitest";
import type * as Cloudflare from "@alchemy.run/cloudflare";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as R from "effect/Record";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Resend from "@thomasfosterau/effect-connect-resend";
import {
  resendBindings,
  resendBindingsConfig,
  type Deployed,
  type ResendBindings,
} from "@thomasfosterau/effect-connect-alchemy";

// What a Worker reads back: Alchemy deploys a `Redacted` as a secret binding,
// which arrives as a plain string, and a string as a plain one; every other
// value is left out. The runtime view is a plain string record; the
// compile-time `Checks` below pin `Deployed<B>` against each provider's env.
// The bindings record, parsed: each value is a `Redacted` (a secret binding)
// or a string (a plain one).
const BindingsRecord = Schema.Record(
  Schema.String,
  Schema.Union([Schema.String, Schema.Redacted(Schema.String)]),
);
const deploy = (bindings: ResendBindings): Record<string, string> =>
  R.map(Schema.decodeUnknownSync(BindingsRecord)(bindings), (value) =>
    Redacted.isRedacted(value) ? Redacted.value(value) : value,
  );

const fromEnv = (env: Record<string, string>) => ConfigProvider.fromEnv({ env });

// Compile-time: each record, as bound and as deployed, is the provider's env.
type Extends<A, B> = [A] extends [B] ? true : false;
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

// The `env` alchemy infers for a Cloudflare Worker whose `env` prop is the
// bindings record `B` (#94).
type WorkerEnv<B> = Cloudflare.InferEnv<Cloudflare.Worker<B>>;
export type Checks = [
  Assert<Extends<ResendBindings, Resend.ResendEnv>>,
  Assert<Extends<Deployed<ResendBindings>, Resend.ResendEnv>>,
  // An optional binding deploys as an optional string, not `?: never` (#94),
  // and a secret as a plain one.
  Assert<
    Equals<
      Deployed<{ readonly KEY: Redacted.Redacted; readonly FROM?: string }>,
      { readonly KEY: string; readonly FROM?: string }
    >
  >,
];

// Compile-time, against alchemy's own model of a deploy: the env a Worker
// bound with each record receives is the provider's env, and is exactly the
// package's `Deployed` view of that record (so neither model drifts, and an
// `any` from either side fails `Equals`).
export type InferEnvChecks = [
  Assert<Extends<WorkerEnv<ResendBindings>, Resend.ResendEnv>>,
  Assert<Equals<WorkerEnv<ResendBindings>, Deployed<ResendBindings>>>,
];

describe("resendBindings", () => {
  it("binds the key under RESEND_API_KEY, which the resolver reads once deployed", () => {
    const bindings = resendBindings({ apiKey: Redacted.make("re_123") });
    expect(R.keys(bindings)).toEqual(["RESEND_API_KEY"]);
    const env = deploy(bindings);
    expect(env).toEqual({ RESEND_API_KEY: "re_123" });
    expect(Option.map(Resend.apiKeyFromEnv(env), Redacted.value)).toEqual(Option.some("re_123"));
  });

  it.effect("reads the key on the deploy machine, and fails without it", () =>
    Effect.gen(function* () {
      const bindings = yield* resendBindingsConfig.parse(fromEnv({ RESEND_API_KEY: "re_123" }));
      expect(deploy(bindings)).toStrictEqual({ RESEND_API_KEY: "re_123" });
      expect((yield* Effect.exit(resendBindingsConfig.parse(fromEnv({}))))._tag).toBe("Failure");
    }),
  );
});
