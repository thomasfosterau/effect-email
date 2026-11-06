/**
 * A consumer's view of every package, imported through their EMITTED
 * declarations (`paths` in tsconfig.json points the package names at
 * `dist/index.d.ts`). Each block exercises the types a real consumer
 * depends on, so a declaration that degrades to `any` fails here rather
 * than in an application. Never executed; type-checked only.
 */

import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import type * as HttpClient from "effect/http/HttpClient";
import {
  ChatSendError,
  ChatService,
  ChatValidationError,
  decodeChatMessage,
  sendChat,
  sendChatBatch,
  decodeEmailMessage,
  EmailSendError,
  EmailService,
  EmailValidationError,
  decodeSmsMessage,
  sendSms,
  SmsSendError,
  SmsService,
  SmsValidationError,
  type ChatMessage,
  type ChatSendResult,
  type EmailMessage,
  type EmailSendResult,
  type SmsMessage,
  type SmsSendResult,
  decodeWhatsAppMessage,
  sendWhatsApp,
  WhatsAppSendError,
  WhatsAppService,
  WhatsAppValidationError,
  type WhatsAppMessage,
  type WhatsAppSendResult,
} from "@thomasfosterau/effect-connect";
import * as Resend from "@thomasfosterau/effect-connect-resend";
import * as Alchemy from "@thomasfosterau/effect-connect-alchemy";

/** A compile-time assertion: `T` must be exactly `true`. */
type Assert<T extends true> = T;
type Equals<A, B> =
  (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;

// ── core ──────────────────────────────────────────────────────────────────

const message: EmailMessage = {
  from: { email: "noreply@example.com", name: "Example" },
  to: [{ email: "reader@example.com" }],
  subject: "Welcome",
  text: "Welcome aboard.",
};

export const sent = Effect.flatMap(EmailService, (email) => email.send(message));
export const decoded = decodeEmailMessage({});
export const recording: Layer.Layer<EmailService> = EmailService.layerRecording([]);

const sms: SmsMessage = { to: "+61412345678", body: "Your code is 123456" };

export const smsSent = sendSms(sms);
export const smsDecoded = decodeSmsMessage({});
export const smsRecording: Layer.Layer<SmsService> = SmsService.layerRecording([]);

const whatsapp: WhatsAppMessage = {
  _tag: "Template",
  to: "+61412345678",
  template: { id: "HX0123", variables: { "1": "123456" } },
};

export const whatsappSent = sendWhatsApp(whatsapp);
export const whatsappDecoded = decodeWhatsAppMessage({});
export const whatsappRecording: Layer.Layer<WhatsAppService> = WhatsAppService.layerRecording([]);

const chat: ChatMessage = { text: "Deploy finished", username: "CI" };

export const chatSent = sendChat(chat);
export const chatBatch = sendChatBatch([chat]);
export const chatDecoded = decodeChatMessage({});
export const chatRecording: Layer.Layer<ChatService> = ChatService.layerRecording([]);

// ── resend ────────────────────────────────────────────────────────────────

export const resendLayer: Layer.Layer<EmailService, never, HttpClient.HttpClient> = Resend.layer({
  apiKey: Redacted.make("re_key"),
});
export const resolved: Layer.Layer<EmailService> = Resend.resolveTransport({
  RESEND_API_KEY: "re_key",
});
export const noop: Layer.Layer<EmailService> = Resend.noop;
export const resendPayload: Resend.ResendSendPayload = Resend.toResendPayload(message);

// ── alchemy ───────────────────────────────────────────────────────────────

export const resendBindings: Alchemy.ResendBindings = Alchemy.resendBindings({
  apiKey: Redacted.make("re_123"),
});

/**
 * Every compile-time assertion, exported so `noUnusedLocals` keeps them and a
 * failing one names itself in the error.
 */
export type Checks = [
  /** _resultIdIsOption */ Assert<Equals<EmailSendResult["id"], Option.Option<string>>>,
  /** _sendSucceedsWithResult */ Assert<Equals<Effect.Success<typeof sent>, EmailSendResult>>,
  /** _sendFailsWithSendError */ Assert<Equals<Effect.Error<typeof sent>, EmailSendError>>,
  /** _sendRequiresService */ Assert<Equals<Effect.Services<typeof sent>, EmailService>>,
  /** _decodeFailsWithValidation */ Assert<
    Equals<Effect.Error<typeof decoded>, EmailValidationError>
  >,
  /** _sendErrorTag */ Assert<Equals<EmailSendError["_tag"], "EmailSendError">>,
  /** _sendErrorStatus */ Assert<Equals<EmailSendError["status"], Option.Option<number>>>,
  /** _smsResultIdIsOption */ Assert<Equals<SmsSendResult["id"], Option.Option<string>>>,
  /** _smsSendSucceedsWithResult */ Assert<Equals<Effect.Success<typeof smsSent>, SmsSendResult>>,
  /** _smsSendFailsWithSendError */ Assert<Equals<Effect.Error<typeof smsSent>, SmsSendError>>,
  /** _smsSendRequiresService */ Assert<Equals<Effect.Services<typeof smsSent>, SmsService>>,
  /** _smsDecodeFailsWithValidation */ Assert<
    Equals<Effect.Error<typeof smsDecoded>, SmsValidationError>
  >,
  /** _smsSendErrorTag */ Assert<Equals<SmsSendError["_tag"], "SmsSendError">>,
  /** _whatsappResultIdIsOption */ Assert<Equals<WhatsAppSendResult["id"], Option.Option<string>>>,
  /** _whatsappSendSucceedsWithResult */ Assert<
    Equals<Effect.Success<typeof whatsappSent>, WhatsAppSendResult>
  >,
  /** _whatsappSendFailsWithSendError */ Assert<
    Equals<Effect.Error<typeof whatsappSent>, WhatsAppSendError>
  >,
  /** _whatsappSendRequiresService */ Assert<
    Equals<Effect.Services<typeof whatsappSent>, WhatsAppService>
  >,
  /** _whatsappDecodeFailsWithValidation */ Assert<
    Equals<Effect.Error<typeof whatsappDecoded>, WhatsAppValidationError>
  >,
  /** _whatsappSendErrorTag */ Assert<Equals<WhatsAppSendError["_tag"], "WhatsAppSendError">>,
  /** _whatsappTags */ Assert<Equals<WhatsAppMessage["_tag"], "Text" | "Template">>,
  /** _chatResultIdIsOption */ Assert<Equals<ChatSendResult["id"], Option.Option<string>>>,
  /** _chatSendSucceedsWithResult */ Assert<
    Equals<Effect.Success<typeof chatSent>, ChatSendResult>
  >,
  /** _chatSendFailsWithSendError */ Assert<Equals<Effect.Error<typeof chatSent>, ChatSendError>>,
  /** _chatSendRequiresService */ Assert<Equals<Effect.Services<typeof chatSent>, ChatService>>,
  /** _chatBatchSucceeds */ Assert<
    Equals<Effect.Success<typeof chatBatch>, ReadonlyArray<ChatSendResult>>
  >,
  /** _chatDecodeFailsWithValidation */ Assert<
    Equals<Effect.Error<typeof chatDecoded>, ChatValidationError>
  >,
  /** _chatSendErrorTag */ Assert<Equals<ChatSendError["_tag"], "ChatSendError">>,
  /** _chatSendErrorStatus */ Assert<Equals<ChatSendError["status"], Option.Option<number>>>,
  /** _chatUsernameOptional */ Assert<Equals<ChatMessage["username"], string | undefined>>,
  /** _alchemyResendKeyRedacted */ Assert<
    Equals<Alchemy.ResendBindings["RESEND_API_KEY"], Redacted.Redacted>
  >,
  /** _alchemyResendDeployedIsEnv */ Assert<
    Alchemy.Deployed<Alchemy.ResendBindings> extends Resend.ResendEnv ? true : false
  >,
  /** _resendPayloadTo */ Assert<
    Equals<Resend.ResendSendPayload["to"], readonly [string, ...Array<string>]>
  >,
];
