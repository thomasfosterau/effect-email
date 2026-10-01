/**
 * A consumer's view of all three packages, imported through their EMITTED
 * declarations (`paths` in tsconfig.json points the package names at
 * `dist/index.d.ts`). Each block exercises the types a real consumer
 * depends on, so a declaration that degrades to `any` fails here rather
 * than in an application. Never executed; type-checked only.
 */

import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import type * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import type * as HttpClient from "effect/http/HttpClient";
import {
  decodeEmailMessage,
  EmailSendError,
  EmailService,
  EmailValidationError,
  type EmailMessage,
  type EmailSendResult,
} from "@thomasfosterau/effect-email";
import * as SendGrid from "@thomasfosterau/effect-email-sendgrid";
import * as Resend from "@thomasfosterau/effect-email-resend";

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
  /** _resendPayloadTo */ Assert<
    Equals<Resend.ResendSendPayload["to"], readonly [string, ...Array<string>]>
  >,
];
