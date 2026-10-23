# `@thomasfosterau/effect-connect`

An Effect-native messaging abstraction: one message model and one service contract per channel (email: `EmailService`; SMS: `SmsService`; WhatsApp: `WhatsAppService`), and their errors, provider-agnostic. The SendGrid and Resend (email) and Twilio (SMS, WhatsApp) providers ship as sibling packages.

This package was created using Claude Code, and its API is in flux: expect churn and breaking changes.

## Install

```bash
pnpm add @thomasfosterau/effect-connect effect
```

`effect` (`>=4.0.0-rc.118`) is a required peer dependency. Node.js 22 or newer is required. Install a provider per channel alongside it: [`@thomasfosterau/effect-connect-sendgrid`](https://github.com/thomasfosterau/effect-connect/tree/trunk/packages/sendgrid#readme) or [`@thomasfosterau/effect-connect-resend`](https://github.com/thomasfosterau/effect-connect/tree/trunk/packages/resend#readme) for email, [`@thomasfosterau/effect-connect-twilio`](https://github.com/thomasfosterau/effect-connect/tree/trunk/packages/twilio#readme) for SMS and WhatsApp.

## Usage

A consumer sends through a channel's service (`EmailService`, `SmsService`, `WhatsAppService`) and provides one provider's layer for it at the edge; each channel is its own service, so an application that sends only email never provides an SMS layer, and a missing provider is a type error rather than a failure at the first send; swapping providers is a one-line layer change. Every provider talks HTTP through Effect's `HttpClient` (`effect/http`), so a test stands in a stub at that seam and nothing ever reaches a vendor from a unit suite.

```ts
import * as Effect from "effect/Effect";
import { EmailService, type EmailMessage } from "@thomasfosterau/effect-connect";

const welcome = (to: string): EmailMessage => ({
  from: { email: "noreply@example.com", name: "Example" },
  to: [{ email: to }],
  subject: "Welcome",
  text: "Welcome aboard.",
  html: "<p>Welcome aboard.</p>",
});

export const sendWelcome = (to: string) =>
  Effect.gen(function* () {
    const email = yield* EmailService;
    const result = yield* email.send(welcome(to));
    yield* Effect.log("sent", { id: result.id });
  });
```

Provide a provider at the edge:

```ts
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/http";
import * as Resend from "@thomasfosterau/effect-connect-resend";

const EmailLive = Resend.layer({
  apiKey: Redacted.make(process.env.RESEND_API_KEY!),
}).pipe(Layer.provide(FetchHttpClient.layer));
```

SMS has the same shape:

```ts
import * as Effect from "effect/Effect";
import { sendSms } from "@thomasfosterau/effect-connect";

export const sendCode = (to: string, code: string) => sendSms({ to, body: `Your code is ${code}` }); // Effect<SmsSendResult, SmsSendError, SmsService>
```

So does WhatsApp, whose message is a tagged union: free-form text (valid only inside WhatsApp's 24-hour customer-service window) or a pre-approved template:

```ts
import { sendWhatsApp } from "@thomasfosterau/effect-connect";

export const sendCode = (to: string, code: string) =>
  sendWhatsApp({ _tag: "Template", to, template: { id: "HX…", variables: { "1": code } } }); // Effect<WhatsAppSendResult, WhatsAppSendError, WhatsAppService>
```

## API

### Email

| Export | What it is |
| --- | --- |
| `EmailAddress`, `Recipient`, `Attachment`, `EmailMessage`, `EmailSendResult` | The message model, as `effect/Schema` schemas with matching types. |
| `EmailService` | The `Context.Service`: `send(message)` and `sendBatch(messages)`, failing `EmailSendError`. `EmailService.layerRecording(sent)` is the test double. |
| `send`, `sendBatch` | Accessors over the service in context. |
| `decodeEmailMessage` | Decode untrusted input into a message, failing `EmailValidationError`. |
| `recipientAddresses` | Every address a message is delivered to (`to`, `cc`, `bcc`). |
| `EmailSendError`, `EmailValidationError` | The contract's errors (`Schema.TaggedError`). |

### SMS

| Export | What it is |
| --- | --- |
| `PhoneNumber`, `SmsSender`, `SmsMessage`, `SmsSendResult` | The SMS model, as `effect/Schema` schemas with matching types. `PhoneNumber` is E.164 (`+61412345678`); `SmsSender` also admits a short code or an alphanumeric sender ID (up to 11 characters). `SmsMessage` is `{ to, from?, body }`: one recipient, a non-empty body, and a `from` that overrides the provider's configured default. |
| `SmsService` | The `Context.Service`: `send(message)` and `sendBatch(messages)`, failing `SmsSendError`. `SmsService.layerRecording(sent)` is the test double. |
| `sendSms`, `sendSmsBatch` | Accessors over the service in context. |
| `decodeSmsMessage` | Decode untrusted input into an SMS, failing `SmsValidationError`. |
| `SmsSendError`, `SmsValidationError` | The contract's errors (`Schema.TaggedError`), the same shape as the email ones. |

### WhatsApp

| Export | What it is |
| --- | --- |
| `WhatsAppMessage`, `WhatsAppTextMessage`, `WhatsAppTemplateMessage`, `WhatsAppTemplate`, `WhatsAppSendResult` | The WhatsApp model, as `effect/Schema` schemas with matching types. `WhatsAppMessage` is a union on `_tag`: `"Text"` is `{ to, from?, body }`, valid only inside WhatsApp's 24-hour customer-service window; `"Template"` is `{ to, from?, template: { id, variables? } }`, a pre-approved template (its provider identifier and placeholder values), the only kind allowed outside it. Numbers are `PhoneNumber` (E.164); a provider adds its own channel prefix. |
| `WhatsAppService` | The `Context.Service`: `send(message)` and `sendBatch(messages)`, failing `WhatsAppSendError`. `WhatsAppService.layerRecording(sent)` is the test double. |
| `sendWhatsApp`, `sendWhatsAppBatch` | Accessors over the service in context. |
| `decodeWhatsAppMessage` | Decode untrusted input into a WhatsApp message, failing `WhatsAppValidationError`. |
| `WhatsAppSendError`, `WhatsAppValidationError` | The contract's errors (`Schema.TaggedError`), the same shape as the SMS ones. |

### Shared

| Export | What it is |
| --- | --- |
| `truncateUpstreamBody`, `UPSTREAM_BODY_LIMIT` | The bound a provider applies to a vendor error body before it can reach a log line. |
| `refuseRedirects` | Run a request with `redirect: "error"` pinned on the underlying `fetch`, layered over your own `FetchHttpClient.RequestInit`, so a 3xx never replays the credential to another host. |
| `rejectionMessage(response, prefix)` | A vendor's non-2xx as one loggable line: the status and the truncated body (just the status when the body can't be read). |
| `describeHttpError`, `httpErrorStatus`, `isSuccessStatus` | A failed request's one-line description and its status (`none` for a transport failure); whether a status is 2xx. |

## Testing a consumer

```ts
import * as Effect from "effect/Effect";
import { EmailService, send, type EmailMessage } from "@thomasfosterau/effect-connect";

const sent: Array<EmailMessage> = [];
await Effect.runPromise(
  send({
    from: { email: "noreply@example.com" },
    to: [{ email: "reader@example.test" }],
    subject: "Welcome",
  }).pipe(Effect.provide(EmailService.layerRecording(sent))),
);
// sent[0].to[0].email === "reader@example.test"
```

## Errors

`EmailSendError` carries the provider name, a one-line `message` safe to log, the vendor's HTTP `status` as an `Option` (`none` for transport failures) and the underlying `cause`. The vendor's error body is truncated to 200 characters before it is embedded, and the credential never appears in one.

`EmailValidationError` is what `decodeEmailMessage` fails with; `issues` lists each schema issue as one line.

`SmsSendError` and `SmsValidationError` mirror them for SMS. An SMS provider never puts the message body (often a one-time code) in an error message.

`WhatsAppSendError` and `WhatsAppValidationError` mirror them for WhatsApp; a provider never puts the body or a template's variables in an error message.

## Relationship to effect-auth

`@thomasfosterau/effect-auth`'s `EmailSender` takes a purpose-keyed message (`{ to, purpose, params }`) and lets an adapter render it. This package's `EmailMessage` is the rendered form, so an effect-auth adapter can be implemented on top of a provider from this repository: render, then `EmailService.send`. There is no dependency in either direction.

## License

MIT
