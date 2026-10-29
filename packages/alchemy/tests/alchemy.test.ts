/**
 * The binding builders against each provider's own env contract: every
 * builder's output, and the `Deployed` view of it a Worker receives (secrets
 * as plain strings), must be assignable to the provider's `…Env` type and be
 * read back as a live configuration by its resolver. The env alchemy itself
 * infers for a Worker bound with each record (`Cloudflare.InferEnv`) must be
 * that same `Deployed` view. Unset optional values must be absent from the
 * record, never `undefined` or `""`.
 */

import { describe, expect, it } from "vite-plus/test";
import type * as Cloudflare from "@alchemy.run/cloudflare";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as Redacted from "effect/Redacted";
import * as Discord from "@thomasfosterau/effect-connect-discord";
import * as Resend from "@thomasfosterau/effect-connect-resend";
import { SendGridConfig } from "@thomasfosterau/effect-connect-sendgrid";
import * as Slack from "@thomasfosterau/effect-connect-slack";
import * as Twilio from "@thomasfosterau/effect-connect-twilio";
import * as Vonage from "@thomasfosterau/effect-connect-vonage";
import {
  discordBindings,
  discordBindingsConfig,
  resendBindings,
  resendBindingsConfig,
  sendGridBindings,
  sendGridBindingsConfig,
  slackBindings,
  slackBindingsConfig,
  twilioBindings,
  twilioBindingsConfig,
  vonageBindings,
  vonageBindingsConfig,
  type Deployed,
  type DiscordBindings,
  type ResendBindings,
  type SendGridBindings,
  type SlackBindings,
  type TwilioBindings,
  type VonageBindings,
} from "@thomasfosterau/effect-connect-alchemy";

// What a Worker reads back: Alchemy deploys a `Redacted` as a secret binding,
// which arrives as a plain string; every other value is kept, and no key is
// added or dropped.
const deploy = <B>(bindings: B): Deployed<B> =>
  // SAFETY: the builders return records of `Redacted` / `string` values, and
  // mapping each `Redacted` to its string is exactly what `Deployed<B>` states;
  // `Record.map` only loses the per-key types.
  Record.map(bindings as Record<string, unknown>, (value) =>
    Redacted.isRedacted(value) ? Redacted.value(value) : value,
  ) as Deployed<B>;

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
  Assert<Extends<TwilioBindings, Twilio.TwilioEnv>>,
  Assert<Extends<Deployed<TwilioBindings>, Twilio.TwilioEnv>>,
  Assert<Extends<VonageBindings, Vonage.VonageEnv>>,
  Assert<Extends<Deployed<VonageBindings>, Vonage.VonageEnv>>,
  Assert<Extends<SlackBindings, Slack.SlackEnv>>,
  Assert<Extends<Deployed<SlackBindings>, Slack.SlackEnv>>,
  Assert<Extends<DiscordBindings, Discord.DiscordEnv>>,
  Assert<Extends<Deployed<DiscordBindings>, Discord.DiscordEnv>>,
  // An optional binding deploys as an optional string, not `?: never` (#94).
  Assert<Equals<Deployed<TwilioBindings>["TWILIO_FROM"], string | undefined>>,
  // SendGrid declares no env type; its `layerConfig` reads `SENDGRID_API_KEY`.
  Assert<Extends<Deployed<SendGridBindings>, { readonly SENDGRID_API_KEY: string }>>,
];

// Compile-time, against alchemy's own model of a deploy: the env a Worker
// bound with each record receives is the provider's env, and is exactly the
// package's `Deployed` view of that record (so neither model drifts, and an
// `any` from either side fails `Equals`).
export type InferEnvChecks = [
  Assert<Extends<WorkerEnv<ResendBindings>, Resend.ResendEnv>>,
  Assert<Equals<WorkerEnv<ResendBindings>, Deployed<ResendBindings>>>,
  Assert<Extends<WorkerEnv<TwilioBindings>, Twilio.TwilioEnv>>,
  Assert<Equals<WorkerEnv<TwilioBindings>, Deployed<TwilioBindings>>>,
  Assert<Extends<WorkerEnv<VonageBindings>, Vonage.VonageEnv>>,
  Assert<Equals<WorkerEnv<VonageBindings>, Deployed<VonageBindings>>>,
  Assert<Extends<WorkerEnv<SlackBindings>, Slack.SlackEnv>>,
  Assert<Equals<WorkerEnv<SlackBindings>, Deployed<SlackBindings>>>,
  Assert<Extends<WorkerEnv<DiscordBindings>, Discord.DiscordEnv>>,
  Assert<Equals<WorkerEnv<DiscordBindings>, Deployed<DiscordBindings>>>,
  Assert<Extends<WorkerEnv<SendGridBindings>, { readonly SENDGRID_API_KEY: string }>>,
  Assert<Equals<WorkerEnv<SendGridBindings>, Deployed<SendGridBindings>>>,
];

describe("resendBindings", () => {
  it("binds the key under RESEND_API_KEY, which the resolver reads once deployed", () => {
    const bindings = resendBindings({ apiKey: Redacted.make("re_123") });
    expect(Record.keys(bindings)).toEqual(["RESEND_API_KEY"]);
    const env = deploy(bindings);
    expect(env).toEqual({ RESEND_API_KEY: "re_123" });
    expect(Option.map(Resend.apiKeyFromEnv(env), Redacted.value)).toEqual(Option.some("re_123"));
  });

  it("reads the key on the deploy machine, and fails without it", () => {
    const bindings = Effect.runSync(
      resendBindingsConfig.parse(fromEnv({ RESEND_API_KEY: "re_123" })),
    );
    expect(deploy(bindings)).toStrictEqual({ RESEND_API_KEY: "re_123" });
    expect(Effect.runSyncExit(resendBindingsConfig.parse(fromEnv({})))._tag).toBe("Failure");
  });
});

describe("sendGridBindings", () => {
  it("binds the key under SENDGRID_API_KEY, which layerConfig reads once deployed", () => {
    const env = deploy(sendGridBindings({ apiKey: Redacted.make("SG.123") }));
    expect(env).toEqual({ SENDGRID_API_KEY: "SG.123" });
    const config = Effect.runSync(
      Effect.gen(function* () {
        return yield* SendGridConfig;
      }).pipe(
        Effect.provide(
          SendGridConfig.layerConfig.pipe(Layer.provide(ConfigProvider.layer(fromEnv(env)))),
        ),
      ),
    );
    expect(Redacted.value(config.apiKey)).toBe("SG.123");
  });

  it("reads the key on the deploy machine", () => {
    const bindings = Effect.runSync(
      sendGridBindingsConfig.parse(fromEnv({ SENDGRID_API_KEY: "SG.123" })),
    );
    expect(deploy(bindings)).toStrictEqual({ SENDGRID_API_KEY: "SG.123" });
  });
});

describe("twilioBindings", () => {
  it("binds every value under its TWILIO_* key, which the resolver reads once deployed", () => {
    const env = deploy(
      twilioBindings({
        accountSid: "AC123",
        authToken: Redacted.make("token"),
        apiKeySid: "SK123",
        from: "+61400000000",
        whatsappFrom: "+61400000001",
        messagingServiceSid: "MG123",
      }),
    );
    expect(env).toEqual({
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "token",
      TWILIO_API_KEY_SID: "SK123",
      TWILIO_FROM: "+61400000000",
      TWILIO_WHATSAPP_FROM: "+61400000001",
      TWILIO_MESSAGING_SERVICE_SID: "MG123",
    });
    expect(Option.isSome(Twilio.configFromEnv(env))).toBe(true);
  });

  it("leaves out optional values that are omitted, undefined or blank", () => {
    const bindings = twilioBindings({
      accountSid: "AC123",
      authToken: Redacted.make("token"),
      from: undefined,
      whatsappFrom: "  ",
    });
    expect(deploy(bindings)).toStrictEqual({
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "token",
    });
    expect("TWILIO_FROM" in bindings).toBe(false);
    expect(Option.isSome(Twilio.configFromEnv(deploy(bindings)))).toBe(true);
  });

  it("reads the values on the deploy machine, leaving out the unset and empty ones", () => {
    const bindings = Effect.runSync(
      twilioBindingsConfig.parse(
        fromEnv({
          TWILIO_ACCOUNT_SID: "AC123",
          TWILIO_AUTH_TOKEN: "token",
          TWILIO_FROM: "+61400000000",
          TWILIO_WHATSAPP_FROM: "",
          TWILIO_MESSAGING_SERVICE_SID: " ",
        }),
      ),
    );
    expect(deploy(bindings)).toStrictEqual({
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "token",
      TWILIO_FROM: "+61400000000",
    });
    expect(
      Effect.runSyncExit(twilioBindingsConfig.parse(fromEnv({ TWILIO_ACCOUNT_SID: "AC123" })))._tag,
    ).toBe("Failure");
  });
});

describe("vonageBindings", () => {
  it("binds every value under its VONAGE_* key, which the resolver reads once deployed", () => {
    const env = deploy(
      vonageBindings({ apiKey: "abc123", apiSecret: Redacted.make("secret"), from: "Acme" }),
    );
    expect(env).toEqual({
      VONAGE_API_KEY: "abc123",
      VONAGE_API_SECRET: "secret",
      VONAGE_FROM: "Acme",
    });
    expect(Option.isSome(Vonage.configFromEnv(env))).toBe(true);
  });

  it("leaves out an unset sender, on the deploy machine too", () => {
    expect(
      deploy(vonageBindings({ apiKey: "abc123", apiSecret: Redacted.make("secret") })),
    ).toStrictEqual({
      VONAGE_API_KEY: "abc123",
      VONAGE_API_SECRET: "secret",
    });
    const bindings = Effect.runSync(
      vonageBindingsConfig.parse(
        fromEnv({ VONAGE_API_KEY: "abc123", VONAGE_API_SECRET: "secret" }),
      ),
    );
    expect(deploy(bindings)).toStrictEqual({
      VONAGE_API_KEY: "abc123",
      VONAGE_API_SECRET: "secret",
    });
  });
});

describe.each([
  {
    name: "slack",
    url: "https://hooks.slack.com/services/T000/B000/XXXX",
    key: "SLACK_WEBHOOK_URL",
    build: (webhookUrl: Redacted.Redacted<string>) => slackBindings({ webhookUrl }),
    parse: (env: Record<string, string>): object =>
      Effect.runSync(slackBindingsConfig.parse(fromEnv(env))),
    resolve: (env: Record<string, string>) => Option.isSome(Slack.configFromEnv(env)),
  },
  {
    name: "discord",
    url: "https://discord.com/api/webhooks/1/abc",
    key: "DISCORD_WEBHOOK_URL",
    build: (webhookUrl: Redacted.Redacted<string>) => discordBindings({ webhookUrl }),
    parse: (env: Record<string, string>): object =>
      Effect.runSync(discordBindingsConfig.parse(fromEnv(env))),
    resolve: (env: Record<string, string>) => Option.isSome(Discord.configFromEnv(env)),
  },
])("$name bindings", ({ url, key, build, parse, resolve }) => {
  it("binds the webhook URL, which the resolver reads once deployed", () => {
    const env = deploy(build(Redacted.make(url)));
    expect(env).toEqual({ [key]: url });
    expect(resolve(env)).toBe(true);
  });

  it("reads the webhook URL on the deploy machine", () => {
    const bindings = parse({ [key]: url });
    expect(deploy(bindings)).toStrictEqual({ [key]: url });
  });
});
