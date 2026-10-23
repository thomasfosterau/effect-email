/**
 * The Slack sender: the core `ChatMessage` posted as JSON to a Slack
 * incoming webhook, over Effect's `HttpClient` with no SDK.
 *
 * The webhook URL is the credential (its path carries the token), so the
 * transport pins:
 *
 * - the URL checked **before any request**: `https:`, exactly
 *   `hooks.slack.com`, no port, userinfo, query or fragment, and a
 *   `/services/<team>/<bot>/<token>` path; anything else fails the send with
 *   `ChatSendError` (`status: none`) and makes no request. The request goes
 *   to the fixed origin (`DEFAULT_BASE_URL`) plus that checked path, so no
 *   configured value can steer it to another host;
 * - through the core's `executeWithSecretUrl`: `redirect: "error"` on the
 *   underlying `fetch`, so a 3xx can never replay the token-bearing request
 *   at another host (SEC-SECRET-001), and error messages composed without
 *   the request URL (Effect's own
 *   `HttpClientError` message names it), with the URL and its path redacted
 *   from any text we do not control, and no `cause` that carries the request;
 * - a non-2xx becomes a `ChatSendError` carrying the status and a
 *   **truncated** body;
 * - no retry: the caller decides the policy.
 *
 * @module Slack
 * @since 0.1.0
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import {
  ChatSendError,
  ChatService,
  droppingSender,
  executeWithSecretUrl,
  type ChatMessage,
  type ChatSendResult,
} from "@thomasfosterau/effect-connect";
import { SlackConfig } from "./SlackConfig.ts";

/**
 * The JSON body a Slack incoming webhook accepts, as far as the core message
 * carries it. `username` is `Schema.optional` because the mapping assigns
 * `undefined` for an absent one, which the JSON encoding drops. Slack honours
 * it only on legacy custom-integration webhooks; a Slack-app webhook posts
 * as the app whatever it says.
 *
 * @since 0.1.0
 */
export const SlackWebhookPayload = Schema.Struct({
  text: Schema.String,
  username: Schema.optional(Schema.String),
});
/**
 * The decoded type of the {@link SlackWebhookPayload} schema.
 *
 * @since 0.1.0
 */
export type SlackWebhookPayload = typeof SlackWebhookPayload.Type;

/**
 * Map a core chat message onto Slack's incoming-webhook body.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import { toSlackPayload } from "@thomasfosterau/effect-connect-slack";
 *
 * assert.deepStrictEqual(toSlackPayload({ text: "Deploy finished", username: "CI" }), {
 *   text: "Deploy finished",
 *   username: "CI",
 * });
 * ```
 *
 * @since 0.1.0
 */
export const toSlackPayload = (message: ChatMessage): SlackWebhookPayload => ({
  text: message.text,
  username: message.username,
});

/** The one host a Slack incoming webhook lives on. */
const SLACK_HOST = "hooks.slack.com";

/** `/services/<team>/<bot>/<token>`: three opaque segments, nothing else. */
const SLACK_PATH = /^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;

/**
 * The path of a Slack incoming-webhook URL, when the URL is one: `https:`,
 * exactly `hooks.slack.com` (no port, userinfo, query or fragment) and a
 * `/services/<team>/<bot>/<token>` path. `none` for anything else, which a
 * send refuses before any request.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Option from "effect/Option";
 * import { webhookPath } from "@thomasfosterau/effect-connect-slack";
 *
 * assert.deepStrictEqual(
 *   webhookPath("https://hooks.slack.com/services/T000/B000/XXXX"),
 *   Option.some("/services/T000/B000/XXXX"),
 * );
 * assert.ok(Option.isNone(webhookPath("https://hooks.slack.com.example.test/services/T/B/X")));
 * assert.ok(Option.isNone(webhookPath("http://hooks.slack.com/services/T/B/X")));
 * ```
 *
 * @since 0.1.0
 */
export const webhookPath = (webhookUrl: string): Option.Option<string> => {
  if (!URL.canParse(webhookUrl)) {
    return Option.none();
  }
  const url = new URL(webhookUrl);
  const exact =
    url.protocol === "https:" &&
    url.hostname === SLACK_HOST &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "";
  return exact && SLACK_PATH.test(url.pathname) ? Option.some(url.pathname) : Option.none();
};

const PROVIDER = "slack";

/** A `ChatSendError` from a message safe to log and the vendor's status, if it answered. */
const onFailure = (message: string, status: Option.Option<number>): ChatSendError =>
  new ChatSendError({ provider: PROVIDER, message, status });

/** A `ChatSendError` for a send refused before any request was made. */
const refused = (message: string): ChatSendError => onFailure(message, Option.none());

/**
 * The core `ChatService` over a Slack incoming webhook and the `HttpClient`
 * in context. Slack answers `200 ok` with no message id, so every result is
 * `id: none`. A webhook has no batch endpoint, so `sendBatch` posts one
 * message at a time, in order (a channel shows messages in arrival order),
 * and fails on the first failure.
 *
 * @since 0.1.0
 */
export const layerChatService: Layer.Layer<
  ChatService,
  never,
  SlackConfig | HttpClient.HttpClient
> = Layer.effect(
  ChatService,
  Effect.gen(function* () {
    const config = yield* SlackConfig;
    const http = yield* HttpClient.HttpClient;

    const send = Effect.fn("Slack.send")(function* (message: ChatMessage) {
      const raw = Redacted.value(config.webhookUrl);
      const path = yield* Option.match(webhookPath(raw), {
        onNone: () =>
          Effect.fail(
            refused(
              "Slack webhook URL is not an https://hooks.slack.com/services/… URL; nothing was sent",
            ),
          ),
        onSome: Effect.succeed,
      });
      // Longest first: the whole URL, then its path (which carries the token).
      const secrets = [raw, path];
      const request = HttpClientRequest.post(`${config.baseUrl}${path}`).pipe(
        HttpClientRequest.bodyJsonUnsafe(toSlackPayload(message)),
      );
      yield* executeWithSecretUrl(http, request, { label: "Slack", secrets, onFailure });
      const result: ChatSendResult = { id: Option.none() };
      return result;
    });

    return {
      send,
      sendBatch: (messages) => Effect.forEach(messages, send, { concurrency: 1 }),
    };
  }),
);

/**
 * The sender used when no webhook is configured: every send **succeeds**
 * without sending, and logs one line that names neither the text nor the
 * webhook URL.
 *
 * Keeps an un-provisioned preview stage working; only safe while the chat
 * message is advisory (a notification). If a post is load-bearing, fail
 * loudly at boot instead of installing this.
 *
 * @since 0.1.0
 */
export const noop: Layer.Layer<ChatService> = Layer.succeed(
  ChatService,
  // Logs neither the text nor the webhook URL (the credential): the line
  // exists only to answer "is chat being dropped for want of a webhook?".
  droppingSender<ChatMessage>(
    () => "[effect-connect-slack] no Slack webhook configured; dropping a chat message",
  ),
);
