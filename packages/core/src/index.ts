/**
 * `@thomasfosterau/effect-email` — the provider-agnostic core: the message
 * model, the `EmailService` contract and its errors. Providers
 * (`@thomasfosterau/effect-email-sendgrid`, `@thomasfosterau/effect-email-resend`)
 * implement the service over `effect/unstable/http`.
 *
 * @module index
 */

export * from "./Email.ts";
export * from "./EmailService.ts";
export * from "./Errors.ts";
