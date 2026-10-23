/**
 * `@thomasfosterau/effect-connect-alchemy` — deploy-time bindings for
 * `@thomasfosterau/effect-connect` on Cloudflare Workers deployed with
 * [Alchemy](https://alchemy.run). One builder per provider produces the
 * record of `env` bindings that provider's `resolveTransport(env)` (or
 * `layerConfig`) reads, under the same keys, with secrets as `Redacted`
 * values (Alchemy deploys those as secret bindings) and unset optional
 * values left out. Each also has a `…BindingsConfig` form that reads the
 * values on the deploy machine through `effect/Config`.
 *
 * It binds credentials only: it provisions nothing on the vendor's side
 * (domains, API keys, Messaging Services), and it imports nothing from
 * `alchemy`, only `effect`.
 *
 * @module index
 * @since 0.1.0
 */

/**
 * The runtime view of a bindings record (`Deployed`).
 *
 * @since 0.1.0
 */
export * from "./Bindings.ts";
/**
 * The Resend bindings (`RESEND_API_KEY`).
 *
 * @since 0.1.0
 */
export * from "./Resend.ts";
/**
 * The SendGrid bindings (`SENDGRID_API_KEY`).
 *
 * @since 0.1.0
 */
export * from "./SendGrid.ts";
/**
 * The Twilio bindings (`TWILIO_*`).
 *
 * @since 0.1.0
 */
export * from "./Twilio.ts";
/**
 * The Vonage bindings (`VONAGE_*`).
 *
 * @since 0.1.0
 */
export * from "./Vonage.ts";
/**
 * The Slack bindings (`SLACK_WEBHOOK_URL`).
 *
 * @since 0.1.0
 */
export * from "./Slack.ts";
/**
 * The Discord bindings (`DISCORD_WEBHOOK_URL`).
 *
 * @since 0.1.0
 */
export * from "./Discord.ts";
