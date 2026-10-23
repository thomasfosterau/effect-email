/**
 * A consumer's view of all seven packages, imported through their EMITTED
 * declarations (`paths` in tsconfig.json points the package names at
 * `dist/index.d.ts`). Each block exercises the types a real consumer
 * depends on, so a declaration that degrades to `any` fails here rather
 * than in an application. Never executed; type-checked only.
 */

import type * as Config from "effect/Config";
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
import * as SendGrid from "@thomasfosterau/effect-connect-sendgrid";
import * as Resend from "@thomasfosterau/effect-connect-resend";
import * as Twilio from "@thomasfosterau/effect-connect-twilio";
import * as Vonage from "@thomasfosterau/effect-connect-vonage";
import * as Slack from "@thomasfosterau/effect-connect-slack";
import * as Discord from "@thomasfosterau/effect-connect-discord";

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

// ── sendgrid ──────────────────────────────────────────────────────────────

export const sendgridLayer: Layer.Layer<
  EmailService | SendGrid.SendGridClient,
  never,
  HttpClient.HttpClient
> = SendGrid.layer({ apiKey: Redacted.make("SG.key") });
export const batched = SendGrid.send(message);
export const templates = SendGrid.Template.list({ generations: "dynamic" });
export const payload: SendGrid.MailSendPayload = SendGrid.toMailSendPayload(message);

// ── resend ────────────────────────────────────────────────────────────────

export const resendLayer: Layer.Layer<EmailService, never, HttpClient.HttpClient> = Resend.layer({
  apiKey: Redacted.make("re_key"),
});
export const resolved: Layer.Layer<EmailService> = Resend.resolveTransport({
  RESEND_API_KEY: "re_key",
});
export const noop: Layer.Layer<EmailService> = Resend.noop;
export const resendPayload: Resend.ResendSendPayload = Resend.toResendPayload(message);

// ── twilio ────────────────────────────────────────────────────────────────

export const twilioLayer: Layer.Layer<SmsService, never, HttpClient.HttpClient> = Twilio.layer({
  accountSid: "AC00000000000000000000000000000000",
  authToken: Redacted.make("token"),
  from: "Example",
});
export const twilioResolved: Layer.Layer<SmsService> = Twilio.resolveTransport({});
export const twilioWhatsAppLayer: Layer.Layer<WhatsAppService, never, HttpClient.HttpClient> =
  Twilio.layerWhatsApp({
    accountSid: "AC00000000000000000000000000000000",
    authToken: Redacted.make("token"),
    whatsappFrom: "+61400000000",
  });
export const twilioWhatsAppResolved: Layer.Layer<WhatsAppService> = Twilio.resolveWhatsAppTransport(
  {},
);
export const twilioWhatsAppNoop: Layer.Layer<WhatsAppService> = Twilio.noopWhatsApp;
export const twilioWhatsAppParams = Twilio.toTwilioWhatsAppParams(whatsapp, {
  from: Option.some("+61400000000"),
  messagingServiceSid: Option.none(),
});
export const twilioNoop: Layer.Layer<SmsService> = Twilio.noop;
export const twilioParams = Twilio.toTwilioParams(sms, {
  from: Option.some("Example"),
  messagingServiceSid: Option.none(),
});

// ── vonage ────────────────────────────────────────────────────────────────

export const vonageLayer: Layer.Layer<SmsService, never, HttpClient.HttpClient> = Vonage.layer({
  apiKey: "key",
  apiSecret: Redacted.make("secret"),
  from: "Example",
});
export const vonageConfigured: Layer.Layer<SmsService, Config.ConfigError, HttpClient.HttpClient> =
  Vonage.layerConfig;
export const vonageResolved: Layer.Layer<SmsService> = Vonage.resolveTransport({});
export const vonageNoop: Layer.Layer<SmsService> = Vonage.noop;
export const vonagePayload = Vonage.toVonagePayload(sms, Option.some("Example"));

// ── slack ─────────────────────────────────────────────────────────────────

export const slackLayer: Layer.Layer<ChatService, never, HttpClient.HttpClient> = Slack.layer({
  webhookUrl: Redacted.make("https://hooks.slack.com/services/T000/B000/XXXX"),
});
export const slackResolved: Layer.Layer<ChatService> = Slack.resolveTransport({});
export const slackNoop: Layer.Layer<ChatService> = Slack.noop;
export const slackPayload: Slack.SlackWebhookPayload = Slack.toSlackPayload(chat);
export const slackOptedIn: Layer.Layer<ChatService, never, HttpClient.HttpClient> = Slack.layer({
  webhookUrl: Redacted.make("https://hooks.slack.com/services/T000/B000/XXXX"),
  allowMentions: true,
});
export const slackEscaped: string = Slack.escapeMassMentions("<!here>");
export const slackPath = Slack.webhookPath("https://hooks.slack.com/services/T000/B000/XXXX");

// ── discord ───────────────────────────────────────────────────────────────

export const discordLayer: Layer.Layer<ChatService, never, HttpClient.HttpClient> = Discord.layer({
  webhookUrl: Redacted.make("https://discord.com/api/webhooks/1/token"),
});
export const discordResolved: Layer.Layer<ChatService> = Discord.resolveTransport({});
export const discordNoop: Layer.Layer<ChatService> = Discord.noop;
export const discordPayload: Discord.DiscordWebhookPayload = Discord.toDiscordPayload(chat);
export const discordOptedIn: Layer.Layer<ChatService, never, HttpClient.HttpClient> = Discord.layer(
  {
    webhookUrl: Redacted.make("https://discord.com/api/webhooks/1/token"),
    allowMentions: true,
  },
);
export const discordWebhook = Discord.parseWebhookUrl("https://discord.com/api/webhooks/1/token");

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
  /** _batchedRequiresService */ Assert<Equals<Effect.Services<typeof batched>, EmailService>>,
  /** _batchedFailsWithSendError */ Assert<Equals<Effect.Error<typeof batched>, EmailSendError>>,
  /** _templatesRequireClient */ Assert<
    Equals<Effect.Services<typeof templates>, SendGrid.SendGridClient>
  >,
  /** _templatesDecoded */ Assert<
    Equals<Effect.Success<typeof templates>["body"]["result"][number]["name"], string>
  >,
  /** _templatesFail */ Assert<
    Equals<
      Effect.Error<typeof templates>,
      SendGrid.SendGridClientError | SendGrid.InvalidApiKeyError
    >
  >,
  /** _payloadCategories */ Assert<
    Equals<SendGrid.MailSendPayload["categories"], ReadonlyArray<string> | undefined>
  >,
  /** _smsResultIdIsOption */ Assert<Equals<SmsSendResult["id"], Option.Option<string>>>,
  /** _smsSendSucceedsWithResult */ Assert<Equals<Effect.Success<typeof smsSent>, SmsSendResult>>,
  /** _smsSendFailsWithSendError */ Assert<Equals<Effect.Error<typeof smsSent>, SmsSendError>>,
  /** _smsSendRequiresService */ Assert<Equals<Effect.Services<typeof smsSent>, SmsService>>,
  /** _smsDecodeFailsWithValidation */ Assert<
    Equals<Effect.Error<typeof smsDecoded>, SmsValidationError>
  >,
  /** _smsSendErrorTag */ Assert<Equals<SmsSendError["_tag"], "SmsSendError">>,
  /** _twilioParams */ Assert<
    Equals<typeof twilioParams, Option.Option<Twilio.TwilioMessageParams>>
  >,
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
  /** _twilioWhatsAppParams */ Assert<
    Equals<typeof twilioWhatsAppParams, Option.Option<Twilio.TwilioWhatsAppParams>>
  >,
  /** _twilioWhatsAppContentVariables */ Assert<
    Equals<Twilio.TwilioWhatsAppParams["ContentVariables"], string | undefined>
  >,
  /** _twilioParamsFrom */ Assert<Equals<Twilio.TwilioMessageParams["From"], string | undefined>>,
  /** _vonagePayload */ Assert<
    Equals<typeof vonagePayload, Option.Option<Vonage.VonageMessagePayload>>
  >,
  /** _vonagePayloadChannel */ Assert<Equals<Vonage.VonageMessagePayload["channel"], "sms">>,
  /** _vonageConfigFromEnv */ Assert<
    Equals<ReturnType<typeof Vonage.configFromEnv>, Option.Option<Vonage.VonageConfigInput>>
  >,
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
  /** _slackPath */ Assert<Equals<typeof slackPath, Option.Option<string>>>,
  /** _slackPayloadUsername */ Assert<
    Equals<Slack.SlackWebhookPayload["username"], string | undefined>
  >,
  /** _slackWebhookUrlRedacted */ Assert<
    Equals<Slack.SlackConfigInput["webhookUrl"], Redacted.Redacted<string>>
  >,
  /** _discordWebhook */ Assert<
    Equals<typeof discordWebhook, Option.Option<Discord.DiscordWebhook>>
  >,
  /** _discordPayloadContent */ Assert<Equals<Discord.DiscordWebhookPayload["content"], string>>,
  /** _discordWebhookUrlRedacted */ Assert<
    Equals<Discord.DiscordConfigInput["webhookUrl"], Redacted.Redacted<string>>
  >,
  /** _slackAllowMentionsOptional */ Assert<
    Equals<Slack.SlackConfigInput["allowMentions"], boolean | undefined>
  >,
  /** _discordAllowMentionsOptional */ Assert<
    Equals<Discord.DiscordConfigInput["allowMentions"], boolean | undefined>
  >,
  /** _discordAllowedMentions */ Assert<
    Equals<
      Discord.DiscordWebhookPayload["allowed_mentions"],
      { readonly parse: ReadonlyArray<"everyone" | "roles" | "users"> } | undefined
    >
  >,
  /** _discordContentLimit */ Assert<Equals<typeof Discord.DISCORD_CONTENT_LIMIT, 2000>>,
  /** _resendPayloadTo */ Assert<
    Equals<Resend.ResendSendPayload["to"], readonly [string, ...Array<string>]>
  >,
];
