/**
 * `@thomasfosterau/effect-connect` — the provider-agnostic core: one message
 * model and one service contract per channel (email, SMS), and their errors.
 * Providers (`@thomasfosterau/effect-connect-sendgrid`,
 * `@thomasfosterau/effect-connect-resend`, `@thomasfosterau/effect-connect-twilio`)
 * implement a channel's service over `effect/http`, through the shared
 * transport rules in `Http`.
 *
 * @module index
 * @since 0.1.0
 */

/**
 * The email message model: addresses, recipients, attachments, the message and the result of a send.
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
 * The SMS message model: phone numbers, senders, the message and the result of a send.
 *
 * @since 0.1.0
 */
export * from "./Sms.ts";
/**
 * The `SmsService` contract, its accessors and the recording test double.
 *
 * @since 0.1.0
 */
export * from "./SmsService.ts";
/**
 * The transport rules every provider applies over `effect/http`: redirect refusal, bounded error bodies.
 *
 * @since 0.1.0
 */
export * from "./Http.ts";
/**
 * The failures the channel contracts admit, and the vendor-body bound.
 *
 * @since 0.1.0
 */
export * from "./Errors.ts";
