/**
 * `@thomasfosterau/effect-email` — the provider-agnostic core: the message
 * model, the `EmailService` contract and its errors. Providers
 * (`@thomasfosterau/effect-email-sendgrid`, `@thomasfosterau/effect-email-resend`)
 * implement the service over `effect/unstable/http`.
 *
 * @module index
 */

/** The message model: addresses, recipients, attachments, the message and the result of a send. */
export * from "./Email.ts";
/** The `EmailService` contract, its accessors and the recording test double. */
export * from "./EmailService.ts";
/** The failures the `EmailService` contract admits. */
export * from "./Errors.ts";
