/**
 * The Discord sender: the core `ChatMessage` posted as JSON to a Discord
 * webhook (Execute Webhook, `POST /api/webhooks/{id}/{token}?wait=true`),
 * over Effect's `HttpClient` with no SDK. `wait=true` makes Discord answer
 * with the created message, whose `id` is the result's id.
 *
 * The webhook URL is the credential (its path carries the token), so the
 * transport pins:
 *
 * - the URL checked **before any request**: `https:`, exactly `discord.com`
 *   or `discordapp.com`, no port, userinfo, query or fragment, and an
 *   `/api/webhooks/<id>/<token>` path (an `/api/v<n>/webhooks/…` one too);
 *   anything else fails the send with `ChatSendError` (`status: none`) and
 *   makes no request. The request goes to the fixed origin
 *   (`DEFAULT_BASE_URL`) plus that checked path, so no configured value can
 *   steer it to another host;
 * - through the core's `executeWithSecretUrl`: `redirect: "error"` on the
 *   underlying `fetch`, so a 3xx can never replay the token-bearing request
 *   at another host (SEC-SECRET-001), and error messages composed without
 *   the request URL (Effect's own
 *   `HttpClientError` message names it), with the URL, its path and its
 *   token redacted from any text we do not control, and no `cause` that
 *   carries the request;
 * - a non-2xx becomes a `ChatSendError` carrying the status and a
 *   **truncated** body;
 * - no retry: the caller decides the policy (Discord's 429 carries a
 *   `retry_after`, which is in the truncated body).
 *
 * @module Discord
 * @since 0.1.0
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import {
  ChatSendError,
  ChatService,
  droppingSender,
  executeWithSecretUrl,
  type ChatMessage,
  type ChatSendResult,
} from "@thomasfosterau/effect-connect";
import { DiscordConfig } from "./DiscordConfig.ts";

/**
 * The most characters Discord accepts in a message's `content`. A longer
 * message is refused before any request rather than sent for Discord to
 * reject. Counted in Unicode code points; Discord's verdict stands for
 * anything this check lets through.
 *
 * @since 0.1.0
 */
export const DISCORD_CONTENT_LIMIT = 2000;

/**
 * The JSON body Discord's Execute Webhook accepts, as far as the core
 * message carries it. `username` is `Schema.optional` because the mapping
 * assigns `undefined` for an absent one, which the JSON encoding drops.
 *
 * @since 0.1.0
 */
export const DiscordWebhookPayload = Schema.Struct({
  content: Schema.String,
  username: Schema.optional(Schema.String),
});
/**
 * The decoded type of the {@link DiscordWebhookPayload} schema.
 *
 * @since 0.1.0
 */
export type DiscordWebhookPayload = typeof DiscordWebhookPayload.Type;

/**
 * Map a core chat message onto Discord's Execute Webhook body.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import { toDiscordPayload } from "@thomasfosterau/effect-connect-discord";
 *
 * assert.deepStrictEqual(toDiscordPayload({ text: "Deploy finished", username: "CI" }), {
 *   content: "Deploy finished",
 *   username: "CI",
 * });
 * ```
 *
 * @since 0.1.0
 */
export const toDiscordPayload = (message: ChatMessage): DiscordWebhookPayload => ({
  content: message.text,
  username: message.username,
});

/** The hosts a Discord webhook lives on (`discordapp.com` is the legacy spelling). */
const DISCORD_HOSTS: ReadonlyArray<string> = ["discord.com", "discordapp.com"];

/** `/api[/v<n>]/webhooks/<snowflake id>/<token>`, nothing else. */
const DISCORD_PATH = /^\/api(?:\/v\d+)?\/webhooks\/\d+\/([A-Za-z0-9_-]+)$/;

/**
 * The parts of a Discord webhook URL that matter to a send, when the URL is
 * one: its `path` and the `token` in it.
 *
 * @since 0.1.0
 */
export interface DiscordWebhook {
  readonly path: string;
  readonly token: string;
}

/**
 * Parse a Discord webhook URL: `https:`, exactly `discord.com` or
 * `discordapp.com` (no port, userinfo, query or fragment) and an
 * `/api/webhooks/<id>/<token>` path. `none` for anything else, which a send
 * refuses before any request.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Option from "effect/Option";
 * import { parseWebhookUrl } from "@thomasfosterau/effect-connect-discord";
 *
 * assert.deepStrictEqual(
 *   parseWebhookUrl("https://discord.com/api/webhooks/123/abc-DEF_0"),
 *   Option.some({ path: "/api/webhooks/123/abc-DEF_0", token: "abc-DEF_0" }),
 * );
 * assert.ok(Option.isNone(parseWebhookUrl("https://discord.com.example.test/api/webhooks/1/x")));
 * assert.ok(Option.isNone(parseWebhookUrl("http://discord.com/api/webhooks/1/x")));
 * ```
 *
 * @since 0.1.0
 */
export const parseWebhookUrl = (webhookUrl: string): Option.Option<DiscordWebhook> => {
  if (!URL.canParse(webhookUrl)) {
    return Option.none();
  }
  const url = new URL(webhookUrl);
  const exact =
    url.protocol === "https:" &&
    DISCORD_HOSTS.includes(url.hostname) &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "";
  const match = exact ? DISCORD_PATH.exec(url.pathname) : null;
  return match === null ? Option.none() : Option.some({ path: url.pathname, token: match[1] });
};

const PROVIDER = "discord";

/** The created message, as far as a send reads it. */
const MessageResponse = Schema.Struct({ id: Schema.String });

/** A `ChatSendError` from a message safe to log and the vendor's status, if it answered. */
const onFailure = (message: string, status: Option.Option<number>): ChatSendError =>
  new ChatSendError({ provider: PROVIDER, message, status });

/** A `ChatSendError` for a send refused before any request was made. */
const refused = (message: string): ChatSendError => onFailure(message, Option.none());

/**
 * The core `ChatService` over a Discord webhook and the `HttpClient` in
 * context. Every send asks for `wait=true`, so the result carries Discord's
 * message id. A webhook has no batch endpoint, so `sendBatch` posts one
 * message at a time, in order (a channel shows messages in arrival order),
 * and fails on the first failure.
 *
 * @since 0.1.0
 */
export const layerChatService: Layer.Layer<
  ChatService,
  never,
  DiscordConfig | HttpClient.HttpClient
> = Layer.effect(
  ChatService,
  Effect.gen(function* () {
    const config = yield* DiscordConfig;
    const http = yield* HttpClient.HttpClient;

    const send = Effect.fn("Discord.send")(function* (message: ChatMessage) {
      const raw = Redacted.value(config.webhookUrl);
      const webhook = yield* Option.match(parseWebhookUrl(raw), {
        onNone: () =>
          Effect.fail(
            refused(
              "Discord webhook URL is not an https://discord.com/api/webhooks/<id>/<token> URL; nothing was sent",
            ),
          ),
        onSome: Effect.succeed,
      });
      if (Array.from(message.text).length > DISCORD_CONTENT_LIMIT) {
        return yield* refused(
          `Discord message text is longer than ${DISCORD_CONTENT_LIMIT} characters; nothing was sent`,
        );
      }
      // Longest first: the whole URL, its path, then the token in it.
      const secrets = [raw, webhook.path, webhook.token];
      const request = HttpClientRequest.post(`${config.baseUrl}${webhook.path}`, {
        acceptJson: true,
        urlParams: { wait: "true" },
      }).pipe(HttpClientRequest.bodyJsonUnsafe(toDiscordPayload(message)));
      const response = yield* executeWithSecretUrl(http, request, {
        label: "Discord",
        secrets,
        onFailure,
      });
      const { id } = yield* HttpClientResponse.schemaBodyJson(MessageResponse)(response).pipe(
        Effect.mapError(
          // No `cause`: a decoding HttpClientError carries the request, whose
          // URL is the credential.
          () =>
            onFailure(
              `Discord answered ${response.status} with an unexpected body`,
              Option.some(response.status),
            ),
        ),
      );
      const result: ChatSendResult = { id: Option.some(id) };
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
    () => "[effect-connect-discord] no Discord webhook configured; dropping a chat message",
  ),
);
