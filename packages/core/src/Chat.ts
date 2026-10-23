/**
 * The chat message model every chat provider sends: a message posted to a
 * chat channel through an incoming webhook, and the result of a send.
 *
 * Provider-agnostic on purpose, as the email and SMS models are: plain text
 * and an optional display name, the subset Slack's and Discord's incoming
 * webhooks both accept. Vendor-only shapes (Slack Block Kit, Discord embeds,
 * either vendor's mention syntax) stay out of the core — see the package
 * `CLAUDE.md`. The destination channel is not part of the message: an
 * incoming webhook is bound to one channel, so it lives in the provider's
 * configuration (the webhook URL).
 *
 * @module Chat
 * @since 0.1.0
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ChatValidationError } from "./Errors.ts";
import { issueLines } from "./internal/issues.ts";

/**
 * One chat message to post: non-empty `text`, and an optional `username`
 * that overrides the webhook's configured display name for this message.
 *
 * The text is sent as-is: each vendor renders its own markup in it (Slack
 * `mrkdwn`, Discord Markdown), and a vendor's own length limit is the
 * provider's to enforce. Whether a vendor honours `username` is the vendor's
 * verdict (Discord does; Slack honours it only on legacy custom-integration
 * webhooks, and a Slack-app webhook ignores it).
 *
 * @since 0.1.0
 */
export const ChatMessage = Schema.Struct({
  text: Schema.NonEmptyString,
  username: Schema.optionalKey(Schema.NonEmptyString),
});
/**
 * The decoded type of the {@link ChatMessage} schema.
 *
 * @since 0.1.0
 */
export type ChatMessage = typeof ChatMessage.Type;

/**
 * What a provider answers for one accepted chat message: the vendor's
 * message id when it gives one (Discord's message snowflake; a Slack
 * incoming webhook answers only `ok`, so `none`). Encodes as an optional
 * `id` key, so a result serialises as plain JSON.
 *
 * @since 0.1.0
 */
export const ChatSendResult = Schema.Struct({
  id: Schema.OptionFromOptionalKey(Schema.String),
});
/**
 * The decoded type of the {@link ChatSendResult} schema.
 *
 * @since 0.1.0
 */
export type ChatSendResult = typeof ChatSendResult.Type;

/**
 * Decode an untrusted value into a {@link ChatMessage}, failing with a
 * {@link ChatValidationError} that lists each issue as one line.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Effect from "effect/Effect";
 * import * as Exit from "effect/Exit";
 * import { decodeChatMessage } from "@thomasfosterau/effect-connect";
 *
 * const valid = Effect.runSyncExit(decodeChatMessage({ text: "Deploy finished", username: "CI" }));
 * assert.ok(Exit.isSuccess(valid));
 *
 * const invalid = Effect.runSyncExit(decodeChatMessage({ text: "" }));
 * assert.ok(Exit.isFailure(invalid));
 * ```
 *
 * @since 0.1.0
 */
export const decodeChatMessage = (
  // oxlint-disable-next-line effect/no-unknown-parameters -- this IS the I/O boundary: the whole point of the function is to run the schema over unparsed input
  input: unknown,
): Effect.Effect<ChatMessage, ChatValidationError> =>
  Schema.decodeUnknownEffect(ChatMessage, { errors: "all" })(input).pipe(
    Effect.mapError(
      (error) =>
        new ChatValidationError({
          message: "The chat message is invalid",
          issues: issueLines(error),
        }),
    ),
  );
