/**
 * The Twilio sender: the core `SmsMessage` and `WhatsAppMessage` mapped onto
 * Twilio Programmable Messaging's
 * `POST /2010-04-01/Accounts/{AccountSid}/Messages.json` (form-encoded),
 * sent over Effect's `HttpClient` with no SDK. Both channels go through one
 * request path, so they share every transport property:
 *
 * - a fixed literal host (`DEFAULT_BASE_URL`), and an account SID
 *   checked against `AC` + 32 hex digits before it is put in the URL path,
 *   so no configured value can steer the request to another path;
 * - `redirect: "error"` on the underlying `fetch`: Workers' default
 *   (`follow`) replays the request at the redirect target with the
 *   `Authorization` header intact, which would hand the Basic credential to
 *   whatever host a hijacked response named (SEC-SECRET-001);
 * - a non-2xx becomes the channel's send error carrying the status and a
 *   **truncated** body, never the raw unbounded one, and never the token;
 * - no retry: the caller decides the policy.
 *
 * @module Twilio
 * @since 0.1.0
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import type * as UrlParams from "effect/http/UrlParams";
import {
  SmsSendError,
  SmsService,
  WhatsAppSendError,
  WhatsAppService,
  describeHttpError,
  httpErrorStatus,
  isSuccessStatus,
  refuseRedirects,
  rejectionMessage,
  type SmsMessage,
  type WhatsAppMessage,
} from "@thomasfosterau/effect-connect";
import { TwilioConfig } from "./TwilioConfig.ts";

/**
 * The form fields Twilio's Messages resource accepts for an SMS, as far as
 * the core message carries them. At least one of `From` /
 * `MessagingServiceSid` is present on every request this provider sends;
 * optional members are `Schema.optional` because the mapping assigns
 * `undefined` for an absent one, which the form encoding drops.
 *
 * @since 0.1.0
 */
export const TwilioMessageParams = Schema.Struct({
  To: Schema.String,
  Body: Schema.String,
  From: Schema.optional(Schema.String),
  MessagingServiceSid: Schema.optional(Schema.String),
});
/**
 * The decoded type of the {@link TwilioMessageParams} schema.
 *
 * @since 0.1.0
 */
export type TwilioMessageParams = typeof TwilioMessageParams.Type;

/**
 * The form fields Twilio's Messages resource accepts for a WhatsApp message:
 * `To` and `From` carry the `whatsapp:` prefix; a text message sets `Body`,
 * a template message sets `ContentSid` and (when it has variables)
 * `ContentVariables`, a JSON object encoded as a string. Absent members are
 * `undefined`, which the form encoding drops.
 *
 * @since 0.1.0
 */
export const TwilioWhatsAppParams = Schema.Struct({
  To: Schema.String,
  From: Schema.optional(Schema.String),
  MessagingServiceSid: Schema.optional(Schema.String),
  Body: Schema.optional(Schema.String),
  ContentSid: Schema.optional(Schema.String),
  ContentVariables: Schema.optional(Schema.String),
});
/**
 * The decoded type of the {@link TwilioWhatsAppParams} schema.
 *
 * @since 0.1.0
 */
export type TwilioWhatsAppParams = typeof TwilioWhatsAppParams.Type;

/**
 * The defaults {@link toTwilioParams} and {@link toTwilioWhatsAppParams}
 * fall back on: the channel's configured sender (`from` for SMS,
 * `whatsappFrom` for WhatsApp) and the Messaging Service, each `none` when
 * unset.
 *
 * @since 0.1.0
 */
export interface TwilioSenderDefaults {
  readonly from: Option.Option<string>;
  readonly messagingServiceSid: Option.Option<string>;
}

/** The sender fields of a request, or `none` when there is no sender at all. */
const resolveSender = (
  own: Option.Option<string>,
  defaults: TwilioSenderDefaults,
): Option.Option<{
  readonly From: Option.Option<string>;
  readonly MessagingServiceSid: Option.Option<string>;
}> => {
  const from = Option.orElse(own, () => defaults.from);
  return Option.isNone(from) && Option.isNone(defaults.messagingServiceSid)
    ? Option.none()
    : Option.some({ From: from, MessagingServiceSid: defaults.messagingServiceSid });
};

/**
 * Map a core SMS onto Twilio's form fields: the message's own `from` wins
 * over the configured default, and a configured Messaging Service rides
 * along either way (Twilio sends from `From` when both are present). `none`
 * when there is no sender at all, which Twilio would reject.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Option from "effect/Option";
 * import { toTwilioParams } from "@thomasfosterau/effect-connect-twilio";
 *
 * const params = toTwilioParams(
 *   { to: "+61412345678", body: "Your code is 123456" },
 *   { from: Option.some("Example"), messagingServiceSid: Option.none() },
 * );
 *
 * assert.deepStrictEqual(
 *   Option.getOrThrow(params),
 *   { To: "+61412345678", Body: "Your code is 123456", From: "Example", MessagingServiceSid: undefined },
 * );
 * ```
 *
 * @since 0.1.0
 */
export const toTwilioParams = (
  message: SmsMessage,
  defaults: TwilioSenderDefaults,
): Option.Option<TwilioMessageParams> =>
  Option.map(resolveSender(Option.fromNullishOr(message.from), defaults), (sender) => ({
    To: message.to,
    Body: message.body,
    From: Option.getOrUndefined(sender.From),
    MessagingServiceSid: Option.getOrUndefined(sender.MessagingServiceSid),
  }));

const WHATSAPP_PREFIX = "whatsapp:";

/** A number as a WhatsApp address; a configured sender may already carry the prefix. */
const whatsappAddress = (number: string): string =>
  number.startsWith(WHATSAPP_PREFIX) ? number : `${WHATSAPP_PREFIX}${number}`;

const encodeContentVariables = Schema.encodeSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)),
);

/**
 * Map a core WhatsApp message onto Twilio's form fields: `To` and `From`
 * prefixed `whatsapp:`, a text message's body as `Body`, a template's `id`
 * as `ContentSid` and its `variables` as the JSON string
 * `ContentVariables`. Sender resolution is the SMS one over the WhatsApp
 * default: the message's own `from` wins over the configured `whatsappFrom`,
 * a configured Messaging Service rides along, and the result is `none` when
 * there is no sender at all.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Option from "effect/Option";
 * import { toTwilioWhatsAppParams } from "@thomasfosterau/effect-connect-twilio";
 *
 * const params = toTwilioWhatsAppParams(
 *   {
 *     _tag: "Template",
 *     to: "+61412345678",
 *     template: { id: "HX0123", variables: { "1": "123456" } },
 *   },
 *   { from: Option.some("+61400000000"), messagingServiceSid: Option.none() },
 * );
 *
 * assert.deepStrictEqual(Option.getOrThrow(params), {
 *   To: "whatsapp:+61412345678",
 *   From: "whatsapp:+61400000000",
 *   MessagingServiceSid: undefined,
 *   Body: undefined,
 *   ContentSid: "HX0123",
 *   ContentVariables: '{"1":"123456"}',
 * });
 * ```
 *
 * @since 0.1.0
 */
export const toTwilioWhatsAppParams = (
  message: WhatsAppMessage,
  defaults: TwilioSenderDefaults,
): Option.Option<TwilioWhatsAppParams> =>
  Option.map(resolveSender(Option.fromNullishOr(message.from), defaults), (sender) => ({
    To: whatsappAddress(message.to),
    From: Option.getOrUndefined(Option.map(sender.From, whatsappAddress)),
    MessagingServiceSid: Option.getOrUndefined(sender.MessagingServiceSid),
    ...Match.valueTags(message, {
      Text: (textMessage) => ({
        Body: textMessage.body,
        ContentSid: undefined,
        ContentVariables: undefined,
      }),
      Template: ({ template }) => ({
        Body: undefined,
        ContentSid: template.id,
        ContentVariables:
          template.variables === undefined ? undefined : encodeContentVariables(template.variables),
      }),
    }),
  }));

const PROVIDER = "twilio";

/** Twilio account SIDs: `AC` and 32 hex digits. Nothing else may reach the URL path. */
const ACCOUNT_SID = /^AC[0-9a-fA-F]{32}$/;

const MessageResponse = Schema.Struct({ sid: Schema.String });

/**
 * How many messages a Twilio `sendBatch` keeps in flight. Twilio has no
 * batch endpoint, and an account's API concurrency is limited, so a batch is
 * sent a few at a time rather than all at once.
 */
const BATCH_CONCURRENCY = 4;

/** The fields of a channel's send error, less the provider (always {@link PROVIDER}). */
interface SendFailure {
  readonly message: string;
  readonly status: Option.Option<number>;
  readonly cause?: unknown;
}

/** One channel over the Messages resource: how it maps a message and spells a failure. */
interface Channel<M, P, E> {
  readonly span: string;
  readonly toParams: (message: M, config: TwilioConfig["Service"]) => Option.Option<P>;
  readonly noSender: string;
  readonly fail: (failure: SendFailure) => E;
}

/**
 * The one request path every channel shares: the account-SID guard, the
 * sender check, the POST with `redirect: "error"`, the truncated non-2xx and
 * the response decoding. A channel supplies only its mapping and its error.
 */
const makeSender = <M, P extends UrlParams.Input, E>(channel: Channel<M, P, E>) =>
  Effect.gen(function* () {
    const config = yield* TwilioConfig;
    const http = yield* HttpClient.HttpClient;

    const postMessage = (params: P): Effect.Effect<string, E> =>
      Effect.gen(function* () {
        const request = HttpClientRequest.post(
          `${config.baseUrl}/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
          { acceptJson: true },
        ).pipe(
          HttpClientRequest.basicAuth(config.username, config.authToken),
          HttpClientRequest.bodyUrlParams(params),
        );
        const response = yield* http.execute(request).pipe(
          refuseRedirects,
          Effect.mapError((error) =>
            channel.fail({
              message: `Twilio was unreachable: ${describeHttpError(error)}`,
              status: httpErrorStatus(error),
              cause: error,
            }),
          ),
        );
        if (!isSuccessStatus(response.status)) {
          const message = yield* rejectionMessage(response, "Twilio rejected the send");
          return yield* Effect.fail(
            channel.fail({ message, status: Option.some(response.status) }),
          );
        }
        const { sid } = yield* HttpClientResponse.schemaBodyJson(MessageResponse)(response).pipe(
          Effect.mapError((cause) =>
            channel.fail({
              message: `Twilio answered ${response.status} with an unexpected body`,
              status: Option.some(response.status),
              cause,
            }),
          ),
        );
        return sid;
      });

    const refused = (message: string): Effect.Effect<never, E> =>
      Effect.fail(channel.fail({ message, status: Option.none() }));

    const send = Effect.fn(channel.span)(function* (message: M) {
      if (!ACCOUNT_SID.test(config.accountSid)) {
        return yield* refused("Twilio account SID is not of the form AC followed by 32 hex digits");
      }
      const params = yield* Option.match(channel.toParams(message, config), {
        onNone: () => refused(channel.noSender),
        onSome: Effect.succeed,
      });
      const sid = yield* postMessage(params);
      return { id: Option.some(sid) };
    });

    return {
      send,
      sendBatch: (messages: ReadonlyArray<M>) =>
        Effect.forEach(messages, send, { concurrency: BATCH_CONCURRENCY }),
    };
  });

/**
 * The core `SmsService` over Twilio's REST API and the `HttpClient` in
 * context. Twilio has no batch endpoint, so `sendBatch` sends each message
 * on its own, a few at a time, and fails on the first failure.
 *
 * @since 0.1.0
 */
export const layerSmsService: Layer.Layer<SmsService, never, TwilioConfig | HttpClient.HttpClient> =
  Layer.effect(
    SmsService,
    makeSender({
      span: "Twilio.send",
      toParams: (message: SmsMessage, config) => toTwilioParams(message, config),
      noSender:
        "Twilio send has no sender: set `from` on the message, or `from` / `messagingServiceSid` in the configuration",
      fail: (failure) => new SmsSendError({ provider: PROVIDER, ...failure }),
    }),
  );

/**
 * The core `WhatsAppService` over Twilio's REST API and the `HttpClient` in
 * context: the same Messages resource and transport as
 * {@link layerSmsService}, with the WhatsApp mapping
 * ({@link toTwilioWhatsAppParams}) over the configured `whatsappFrom` — never
 * the SMS `from` — and Messaging Service. `sendBatch` sends each message on
 * its own, a few at a time, and fails on the first failure.
 *
 * @since 0.1.0
 */
export const layerWhatsAppService: Layer.Layer<
  WhatsAppService,
  never,
  TwilioConfig | HttpClient.HttpClient
> = Layer.effect(
  WhatsAppService,
  makeSender({
    span: "Twilio.sendWhatsApp",
    toParams: (message: WhatsAppMessage, config) =>
      toTwilioWhatsAppParams(message, {
        from: config.whatsappFrom,
        messagingServiceSid: config.messagingServiceSid,
      }),
    noSender:
      "Twilio WhatsApp send has no sender: set `from` on the message, or `whatsappFrom` / `messagingServiceSid` in the configuration",
    fail: (failure) => new WhatsAppSendError({ provider: PROVIDER, ...failure }),
  }),
);

/**
 * A channel's `send` / `sendBatch` that succeed without sending, logging one
 * fixed `line` per message: never the recipient (PII), the body or a
 * template's variables (either is very often a one-time code). The line
 * exists only to answer "is this channel being dropped for want of a
 * credential?".
 */
const dropping = <M>(line: string) => {
  const dropOne = (_message: M) =>
    Effect.as(Effect.logWarning(line), { id: Option.none<string>() });
  return {
    send: dropOne,
    sendBatch: (messages: ReadonlyArray<M>) =>
      Effect.forEach(messages, dropOne, { concurrency: 1 }),
  };
};

/**
 * The SMS sender used when no credential is configured: every send
 * **succeeds** without sending, and logs one line that names neither the
 * recipient nor the body.
 *
 * The same trade as the Resend provider's `noop`: it keeps an un-provisioned
 * preview stage working, and is only safe while the SMS is advisory. If a
 * send gates an account (a sign-in code with no other way in), fail loudly at
 * boot instead of installing this.
 *
 * @since 0.1.0
 */
export const noop: Layer.Layer<SmsService> = Layer.succeed(
  SmsService,
  dropping<SmsMessage>("[effect-connect-twilio] no Twilio credentials configured; dropping an SMS"),
);

/**
 * The WhatsApp counterpart of {@link noop}: every send **succeeds** without
 * sending, and logs one fixed line that names neither the recipient, the
 * body nor a template's variables. The same trade: only safe while the
 * message is advisory.
 *
 * @since 0.1.0
 */
export const noopWhatsApp: Layer.Layer<WhatsAppService> = Layer.succeed(
  WhatsAppService,
  dropping<WhatsAppMessage>(
    "[effect-connect-twilio] no Twilio credentials configured; dropping a WhatsApp message",
  ),
);
