/**
 * The Resend sender: the core `EmailMessage` mapped onto Resend's
 * `POST /emails` (and `POST /emails/batch`) JSON, sent over Effect's
 * `HttpClient` with no SDK — the library form of the hand-rolled senders the
 * website, gardeneria and preferenceflow applications carry.
 *
 * The properties those senders pin, kept here:
 *
 * - a fixed literal host ({@link DEFAULT_BASE_URL});
 * - `redirect: "error"` on the underlying `fetch`. Workers' default
 *   (`follow`) replays the request at the redirect target **with the headers
 *   intact** — it does not drop `Authorization` on a cross-origin hop the way
 *   a browser does — so a 3xx from a hijacked or misconfigured
 *   `api.resend.com` would hand the API key to whatever host the response
 *   named. A Resend send has no legitimate reason to redirect, so the correct
 *   behaviour is to fail loudly (SEC-SECRET-001);
 * - a non-2xx becomes an `EmailSendError` carrying the status and a
 *   **truncated** body, never the raw unbounded one, and never the key;
 * - no retry: the caller decides the policy.
 *
 * @module Resend
 * @since 0.1.0
 */

import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import * as Str from "effect/String";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import {
  EmailSendError,
  EmailService,
  truncateUpstreamBody,
  type EmailMessage,
  type EmailSendResult,
  type Recipient,
} from "@thomasfosterau/effect-connect";
import { ResendConfig } from "./ResendConfig.ts";

const ResendAttachment = Schema.Struct({
  filename: Schema.String,
  content: Schema.String,
  content_type: Schema.String,
});

const ResendTag = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
});

/**
 * The wire payload Resend's send endpoint accepts, stated once and checked
 * against what `EmailMessage` carries. Optional members are `Schema.optional`
 * rather than `optionalKey` on purpose: the mapping assigns `undefined` for
 * an absent message field and JSON encoding drops the key.
 *
 * @since 0.1.0
 */
export const ResendSendPayload = Schema.Struct({
  from: Schema.String,
  to: Schema.NonEmptyArray(Schema.String),
  cc: Schema.optional(Schema.Array(Schema.String)),
  bcc: Schema.optional(Schema.Array(Schema.String)),
  reply_to: Schema.optional(Schema.Array(Schema.String)),
  subject: Schema.String,
  text: Schema.optional(Schema.String),
  html: Schema.optional(Schema.String),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  attachments: Schema.optional(Schema.Array(ResendAttachment)),
  tags: Schema.optional(Schema.Array(ResendTag)),
});
/**
 * The decoded type of the {@link ResendSendPayload} schema.
 *
 * @since 0.1.0
 */
export type ResendSendPayload = typeof ResendSendPayload.Type;

const SendResponse = Schema.Struct({ id: Schema.String });
const BatchResponse = Schema.Struct({ data: Schema.Array(SendResponse) });

/**
 * `Name <address>` when the recipient has a display name, else the bare address.
 *
 * @since 0.1.0
 */
export const formatAddress = (recipient: Recipient): string =>
  Option.match(Option.fromNullishOr(recipient.name), {
    onNone: () => recipient.email,
    onSome: (name) => `${name} <${recipient.email}>`,
  });

/**
 * Map a core message onto Resend's send payload: recipients as
 * `Name <address>` strings, `replyTo` as a one-element `reply_to`, core
 * `tags` as Resend tags whose name and value are both the tag.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import { toResendPayload } from "@thomasfosterau/effect-connect-resend";
 *
 * const payload = toResendPayload({
 *   from: { email: "noreply@example.com", name: "Example" },
 *   to: [{ email: "reader@example.com" }],
 *   replyTo: { email: "support@example.com" },
 *   subject: "Welcome",
 *   tags: ["welcome"],
 * });
 *
 * assert.strictEqual(payload.from, "Example <noreply@example.com>");
 * assert.deepStrictEqual(payload.to, ["reader@example.com"]);
 * assert.deepStrictEqual(payload.reply_to, ["support@example.com"]);
 * assert.deepStrictEqual(payload.tags, [{ name: "welcome", value: "welcome" }]);
 * ```
 *
 * @since 0.1.0
 */
export const toResendPayload = (message: EmailMessage): ResendSendPayload => ({
  from: formatAddress(message.from),
  to: [formatAddress(message.to[0]), ...message.to.slice(1).map(formatAddress)],
  cc: message.cc?.map(formatAddress),
  bcc: message.bcc?.map(formatAddress),
  reply_to: Option.getOrUndefined(
    Option.map(Option.fromNullishOr(message.replyTo), (replyTo) => [formatAddress(replyTo)]),
  ),
  subject: message.subject,
  text: message.text,
  html: message.html,
  headers: message.headers,
  attachments: message.attachments?.map((attachment) => ({
    filename: attachment.filename,
    content: attachment.content,
    content_type: attachment.contentType,
  })),
  tags: message.tags?.map((tag) => ({ name: tag, value: tag })),
});

const PROVIDER = "resend";

/** Resend's status when it answered at all, else `none`. */
const statusOf = (error: HttpClientError.HttpClientError): Option.Option<number> =>
  error.reason._tag === "StatusCodeError"
    ? Option.some(error.reason.response.status)
    : Option.none();

/**
 * Refuse redirects on the underlying `fetch` (see the module doc). Layered
 * over whatever `RequestInit` defaults the consumer already provides, so a
 * `credentials` or `cache` setting survives; only `redirect` is pinned.
 * Harmless under a non-fetch `HttpClient`, which never reads the service.
 */
const withRedirectRefused = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.flatMap(Effect.serviceOption(FetchHttpClient.RequestInit), (existing) =>
    effect.pipe(
      Effect.provideService(FetchHttpClient.RequestInit, {
        ...Option.getOrElse(existing, () => ({})),
        redirect: "error",
      }),
    ),
  );

const isSuccess = (status: number): boolean => status >= 200 && status < 300;

/** The transport's own message when there is one (a `fetch` rejection), else Effect's. */
const describeHttpError = (error: HttpClientError.HttpClientError): string =>
  Match.value(error.reason).pipe(
    Match.tag("TransportError", (reason) =>
      Predicate.isError(reason.cause) ? reason.cause.message : error.message,
    ),
    Match.orElse(() => error.message),
  );

/**
 * The core `EmailService` over Resend's REST API and the `HttpClient` in
 * context. `sendBatch` uses `POST /emails/batch` (one request, up to 100
 * messages per Resend's limit — the caller chunks beyond that).
 *
 * @since 0.1.0
 */
export const layerEmailService: Layer.Layer<
  EmailService,
  never,
  ResendConfig | HttpClient.HttpClient
> = Layer.effect(
  EmailService,
  Effect.gen(function* () {
    const config = yield* ResendConfig;
    const http = yield* HttpClient.HttpClient;

    /** One `POST` to Resend, decoded with `schema` on a 2xx. */
    const post = Effect.fn("Resend.post")(function* <A, I>(
      path: string,
      body: ResendSendPayload | ReadonlyArray<ResendSendPayload>,
      schema: Schema.Codec<A, I>,
    ) {
      const request = yield* HttpClientRequest.post(`${config.baseUrl}${path}`, {
        acceptJson: true,
      }).pipe(
        HttpClientRequest.bearerToken(config.apiKey),
        HttpClientRequest.bodyJson(body),
        Effect.mapError(
          (cause) =>
            new EmailSendError({
              provider: PROVIDER,
              message: "Resend request body could not be encoded as JSON",
              status: Option.none(),
              cause,
            }),
        ),
      );
      const response = yield* http.execute(request).pipe(
        withRedirectRefused,
        Effect.mapError(
          (error) =>
            new EmailSendError({
              provider: PROVIDER,
              message: `Resend was unreachable: ${describeHttpError(error)}`,
              status: statusOf(error),
              cause: error,
            }),
        ),
      );
      if (!isSuccess(response.status)) {
        // A vendor error response is exactly the kind of thing that can echo
        // request context back, so it is truncated before it can reach a
        // log line — and a body that cannot be read still fails with the status.
        const detail = yield* response.text.pipe(
          Effect.map(truncateUpstreamBody),
          Effect.catchTag("HttpClientError", () => Effect.succeed("")),
        );
        return yield* new EmailSendError({
          provider: PROVIDER,
          message: Str.isEmpty(detail)
            ? `Resend rejected the send: ${response.status}`
            : `Resend rejected the send: ${response.status} ${detail}`,
          status: Option.some(response.status),
        });
      }
      return yield* HttpClientResponse.schemaBodyJson(schema)(response).pipe(
        Effect.mapError(
          (cause) =>
            new EmailSendError({
              provider: PROVIDER,
              message: `Resend answered ${response.status} with an unexpected body`,
              status: Option.some(response.status),
              cause,
            }),
        ),
      );
    });

    const send = Effect.fn("Resend.send")(function* (message: EmailMessage) {
      const { id } = yield* post("/emails", toResendPayload(message), SendResponse);
      const result: EmailSendResult = { id: Option.some(id) };
      return result;
    });

    const sendBatch = Effect.fn("Resend.sendBatch")(function* (
      messages: ReadonlyArray<EmailMessage>,
    ) {
      if (!Arr.isReadonlyArrayNonEmpty(messages)) {
        const none: ReadonlyArray<EmailSendResult> = [];
        return none;
      }
      const { data } = yield* post("/emails/batch", messages.map(toResendPayload), BatchResponse);
      return data.map((entry): EmailSendResult => ({ id: Option.some(entry.id) }));
    });

    return { send, sendBatch };
  }),
);

const dropOne = (message: EmailMessage): Effect.Effect<EmailSendResult> =>
  Effect.as(
    // Logs the subject only — never the recipient (PII) and never the body
    // (a verification URL IS the token). The subject alone answers the
    // question this line exists for: "is mail being dropped for want of a
    // credential?"
    Effect.logWarning(
      `[effect-connect-resend] no RESEND_API_KEY configured; dropping "${message.subject}"`,
    ),
    { id: Option.none() },
  );

/**
 * The sender used when no API key is configured: every send **succeeds**
 * without sending, and logs the subject only.
 *
 * Deliberately succeeds rather than failing. The consuming applications'
 * preview and dev stages deploy without the credential, so a failing stub
 * would turn "no mail configured" into "signup is broken" on every preview
 * stage — and inside a queue consumer, into every notification in the batch
 * being re-delivered, forever. That trade is only safe while the mail is
 * advisory (a verification a user can still sign in without, a notification
 * that also went out as push); if a send ever gates an account, fail loudly
 * at boot instead of installing this.
 *
 * @since 0.1.0
 */
export const noop: Layer.Layer<EmailService> = Layer.succeed(EmailService, {
  send: dropOne,
  sendBatch: (messages) => Effect.forEach(messages, dropOne, { concurrency: 1 }),
});
