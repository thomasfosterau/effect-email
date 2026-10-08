/**
 * `@thomasfosterau/effect-email` — the provider-agnostic core: the message
 * model, the `EmailService` contract and its errors. Providers
 * (`@thomasfosterau/effect-email-sendgrid`, `@thomasfosterau/effect-email-resend`)
 * implement the service over `effect/http`.
 *
 * @module index
 * @since 0.1.0
 */

/**
 * The message model: addresses, recipients, attachments, the message and the result of a send.
 *
 * @since 0.1.0
 */
export * from "./Email.ts";
/**
 * The `EmailService` contract, its accessors and the recording test double.
 *
 * @since 0.1.0
 */
export * from "./EmailService.ts";
/**
 * The failures the `EmailService` contract admits.
 *
 * @since 0.1.0
 */
export * from "./Errors.ts";
