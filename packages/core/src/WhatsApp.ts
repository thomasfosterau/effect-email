/**
 * The WhatsApp message model every WhatsApp provider sends: a free-form text
 * message, a pre-approved template message, and the result of a send.
 *
 * WhatsApp admits free-form text only inside the 24-hour customer-service
 * window that opens when the recipient last messaged the sender; outside it
 * a business may send only a template the platform approved in advance. The
 * model makes the two a tagged union (`_tag: "Text"` / `"Template"`), so a
 * consumer says which it means and a provider maps each onto its wire format
 * (Twilio's `Body`, or `ContentSid` + `ContentVariables`). Provider-only
 * concepts (a Twilio Content SID's `HX…` shape, a Messaging Service) stay in
 * that provider — see the package `CLAUDE.md`.
 *
 * Numbers reuse the SMS model's `PhoneNumber` (E.164): a WhatsApp address is
 * a phone number, and a provider adds its own channel prefix (`whatsapp:`).
 *
 * @module WhatsApp
 * @since 0.1.0
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { WhatsAppValidationError } from "./Errors.ts";
import { issueLines } from "./internal/issues.ts";
import { PhoneNumber } from "./Sms.ts";

/**
 * A free-form WhatsApp text message: one recipient, a non-empty body.
 *
 * Valid only inside WhatsApp's 24-hour customer-service window; outside it
 * the platform rejects the send and a {@link WhatsAppTemplateMessage} is
 * required. `from` is optional: a provider configured with a default
 * WhatsApp sender fills it in, and a message's own `from` wins over it.
 *
 * @since 0.1.0
 */
export const WhatsAppTextMessage = Schema.TaggedStruct("Text", {
  to: PhoneNumber,
  from: Schema.optionalKey(PhoneNumber),
  body: Schema.NonEmptyString,
});
/**
 * The decoded type of the {@link WhatsAppTextMessage} schema.
 *
 * @since 0.1.0
 */
export type WhatsAppTextMessage = typeof WhatsAppTextMessage.Type;

/**
 * A pre-approved WhatsApp template: the provider's identifier for it (`id`)
 * and the values of its placeholders (`variables`, keyed by placeholder
 * name or position, such as `"1"`). Provider-neutral naming: Twilio calls
 * the identifier a Content SID.
 *
 * @since 0.1.0
 */
export const WhatsAppTemplate = Schema.Struct({
  id: Schema.NonEmptyString,
  variables: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
/**
 * The decoded type of the {@link WhatsAppTemplate} schema.
 *
 * @since 0.1.0
 */
export type WhatsAppTemplate = typeof WhatsAppTemplate.Type;

/**
 * A WhatsApp template message: one recipient and a pre-approved
 * {@link WhatsAppTemplate}. The only kind of message a business may send
 * outside the 24-hour customer-service window.
 *
 * @since 0.1.0
 */
export const WhatsAppTemplateMessage = Schema.TaggedStruct("Template", {
  to: PhoneNumber,
  from: Schema.optionalKey(PhoneNumber),
  template: WhatsAppTemplate,
});
/**
 * The decoded type of the {@link WhatsAppTemplateMessage} schema.
 *
 * @since 0.1.0
 */
export type WhatsAppTemplateMessage = typeof WhatsAppTemplateMessage.Type;

/**
 * One WhatsApp message to send: a free-form {@link WhatsAppTextMessage}
 * (`_tag: "Text"`) or a {@link WhatsAppTemplateMessage}
 * (`_tag: "Template"`).
 *
 * @since 0.1.0
 */
export const WhatsAppMessage = Schema.Union([WhatsAppTextMessage, WhatsAppTemplateMessage]);
/**
 * The decoded type of the {@link WhatsAppMessage} schema.
 *
 * @since 0.1.0
 */
export type WhatsAppMessage = typeof WhatsAppMessage.Type;

/**
 * What a provider answers for one accepted WhatsApp message: the provider's
 * message id when it gives one (Twilio's `SM…` / `MM…` SID). Encodes as an
 * optional `id` key, so a result serialises as plain JSON.
 *
 * @since 0.1.0
 */
export const WhatsAppSendResult = Schema.Struct({
  id: Schema.OptionFromOptionalKey(Schema.String),
});
/**
 * The decoded type of the {@link WhatsAppSendResult} schema.
 *
 * @since 0.1.0
 */
export type WhatsAppSendResult = typeof WhatsAppSendResult.Type;

/**
 * Decode an untrusted value into a {@link WhatsAppMessage}, failing with a
 * {@link WhatsAppValidationError} that lists each issue as one line.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Effect from "effect/Effect";
 * import * as Exit from "effect/Exit";
 * import { decodeWhatsAppMessage } from "@thomasfosterau/effect-connect";
 *
 * const template = Effect.runSyncExit(
 *   decodeWhatsAppMessage({
 *     _tag: "Template",
 *     to: "+61412345678",
 *     template: { id: "HX0123", variables: { "1": "123456" } },
 *   }),
 * );
 * assert.ok(Exit.isSuccess(template));
 *
 * const invalid = Effect.runSyncExit(
 *   decodeWhatsAppMessage({ _tag: "Text", to: "0412 345 678", body: "" }),
 * );
 * assert.ok(Exit.isFailure(invalid));
 * ```
 *
 * @since 0.1.0
 */
export const decodeWhatsAppMessage = (
  // oxlint-disable-next-line effect/no-unknown-parameters -- this IS the I/O boundary: the whole point of the function is to run the schema over unparsed input
  input: unknown,
): Effect.Effect<WhatsAppMessage, WhatsAppValidationError> =>
  Schema.decodeUnknownEffect(WhatsAppMessage, { errors: "all" })(input).pipe(
    Effect.mapError(
      (error) =>
        new WhatsAppValidationError({
          message: "The WhatsApp message is invalid",
          issues: issueLines(error),
        }),
    ),
  );
