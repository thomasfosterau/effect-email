# `@thomasfosterau/effect-connect-sendgrid`

The SendGrid provider for [`@thomasfosterau/effect-connect`](https://github.com/thomasfosterau/effect-connect/tree/trunk/packages/core#readme): the core `EmailService` over SendGrid's v3 Mail Send API with request batching, plus a typed client for the Templates, Marketing Contacts, API Keys and User Profile resources. HTTP goes through Effect's `HttpClient` (`effect/http`); there is no SDK.

This package was created using Claude Code, and its API is in flux: expect churn and breaking changes.

This package absorbs the former `thomasfosterau/effect-sendgrid` wrapper: the same surface (mail send, the batched request resolver, the generic `request` seam, the resource helpers) ported from `@sendgrid/mail` / `@sendgrid/client` onto Effect's own HTTP client and the shared core message model.

## Install

```bash
pnpm add @thomasfosterau/effect-connect-sendgrid @thomasfosterau/effect-connect effect
```

`effect` (`>=4.0.0-rc.118`) is a required peer dependency. Node.js 22 or newer is required.

## Usage

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient } from "effect/http";
import { EmailService } from "@thomasfosterau/effect-connect";
import * as SendGrid from "@thomasfosterau/effect-connect-sendgrid";

const EmailLive = SendGrid.layer({ apiKey: Redacted.make(process.env.SENDGRID_API_KEY!) }).pipe(
  Layer.provide(FetchHttpClient.layer),
);

const program = Effect.gen(function* () {
  const email = yield* EmailService;
  const result = yield* email.send({
    from: { email: "noreply@example.com", name: "Example" },
    to: [{ email: "reader@example.com" }],
    subject: "Welcome",
    text: "Welcome aboard.",
    html: "<p>Welcome aboard.</p>",
  });
  // result.id is SendGrid's X-Message-Id, as an Option
});

Effect.runPromise(program.pipe(Effect.provide(EmailLive)));
```

`SendGrid.layerConfig` reads `SENDGRID_API_KEY` (and an optional `SENDGRID_BASE_URL`, e.g. `https://api.eu.sendgrid.com`) through `effect/Config` instead. An unset or empty `SENDGRID_API_KEY` still builds the layer, so a stage without a credential boots, and every resource call then fails with `InvalidApiKeyError` before any request (a send: `EmailSendError` with that `cause`). Effect's `ConfigProvider` reads an empty variable as missing, so the two cases can't be told apart: both boot. An empty `SENDGRID_BASE_URL` falls back to the default host.

## API

| Export | What it is |
| --- | --- |
| `layer(config)`, `layerConfig` | The `EmailService` and `SendGridClient` over the `HttpClient` in context, from literal config or from `SENDGRID_API_KEY` / `SENDGRID_BASE_URL`. |
| `send`, `sendMany`, `SendEmailRequest` | The batched send through a `RequestResolver` (see below). |
| `SendGridClient`, `request`, `requestJson`, `ClientRequest`, `ClientResponse`, `ClientResponseBody`, `ClientMethod` | The generic v3 REST client. |
| `Template`, `Contact`, `ApiKey`, `UserProfile` | Typed helpers over `requestJson` for four resources (see [Resource helpers](#resource-helpers)). |
| `TemplateData`, `TemplateVersion`, `ContactData`, `ApiKeyData`, `UserProfileData` | The resources' `effect/Schema` schemas, with matching types. |
| `toMailSendPayload`, `MailSendPayload` | The core-message → `POST /v3/mail/send` mapping. |
| `SendGridConfig`, `SendGridConfigInput`, `DEFAULT_BASE_URL` | The credential and host as a service. |
| `layerEmailService` | The `EmailService` over a `SendGridClient` you provide yourself. |
| `SendGridClientError`, `InvalidApiKeyError` | The client's failures (see Errors). |

## Batched sends

`SendGrid.send(message)` goes through a `RequestResolver`: concurrent sends in the same batch window reach the `EmailService` as one `sendBatch` call.

```ts
import * as Effect from "effect/Effect";
import type { EmailMessage } from "@thomasfosterau/effect-connect";
import * as SendGrid from "@thomasfosterau/effect-connect-sendgrid";

const message = (to: string): EmailMessage => ({
  from: { email: "noreply@example.com" },
  to: [{ email: to }],
  subject: "Hello",
  text: "Hello.",
});

const program = Effect.gen(function* () {
  const pair = yield* Effect.all(
    [SendGrid.send(message("a@example.com")), SendGrid.send(message("b@example.com"))],
    { concurrency: "unbounded" },
  );
  // or
  const many = yield* SendGrid.sendMany([message("c@example.com"), message("d@example.com")]);
  return [...pair, ...many];
});
```

SendGrid's mail-send endpoint takes one message per request, so `sendBatch` sends them concurrently (bounded); the batching buys one service call, not one HTTP request.

If any message in a batch window fails, every `send` in that window fails with that error, including messages SendGrid had already accepted, so retrying the whole window can deliver duplicates. For per-message outcomes, call `EmailService.send` (or the core `send` accessor) directly; those are not batched.

## The generic client and the resource helpers

```ts
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SendGrid from "@thomasfosterau/effect-connect-sendgrid";

const Stats = Schema.Array(Schema.Struct({ date: Schema.String }));

const program = Effect.gen(function* () {
  const templates = yield* SendGrid.Template.list({ generations: "dynamic" });
  templates.body.result[0]?.name;

  yield* SendGrid.Contact.upsert([{ email: "reader@example.com", first_name: "Reader" }]);
  const key = yield* SendGrid.ApiKey.create({ name: "worker", scopes: ["mail.send"] });
  const profile = yield* SendGrid.UserProfile.get();

  // Anything else on the v3 API:
  const raw = yield* SendGrid.request({
    url: "/v3/stats",
    method: "GET",
    qs: { start_date: "2026-01-01" },
  });
  raw.status;
  raw.body; // parsed JSON, the text when it isn't JSON, `undefined` when empty
  raw.headers;
  const typed = yield* SendGrid.requestJson(Stats)({ url: "/v3/stats", method: "GET" });
  return { key, profile, typed };
});
```

### Resource helpers

| Helper | Request | `body` decoded as |
| --- | --- | --- |
| `Template.list(options?)` | `GET /v3/templates` (`generations`, `page_size`) | `{ result: TemplateData[] }` |
| `Template.get(id)` | `GET /v3/templates/{id}` | `TemplateData` |
| `Template.create({ name, generation? })` | `POST /v3/templates` | `TemplateData` |
| `Template.update(id, { name? })` | `PATCH /v3/templates/{id}` | `TemplateData` |
| `Template.remove(id)` | `DELETE /v3/templates/{id}` | not decoded (`request`; `204`, empty) |
| `Contact.upsert(contacts)` | `PUT /v3/marketing/contacts` | `{ job_id }` (processed asynchronously) |
| `Contact.search({ query?, page_size?, page_token? }?)` | `POST /v3/marketing/contacts/search` | `{ result: ContactData[], contact_count }` |
| `Contact.get(id)` | `GET /v3/marketing/contacts/{id}` | `ContactData` |
| `Contact.remove(ids)` | `DELETE /v3/marketing/contacts?ids=…` | `{ job_id }` |
| `ApiKey.list({ limit? }?)` | `GET /v3/api_keys` | `{ result: ApiKeyData[] }` |
| `ApiKey.get(id)` | `GET /v3/api_keys/{id}` | `ApiKeyData` |
| `ApiKey.create({ name, scopes? })` | `POST /v3/api_keys` | `ApiKeyData` (carries `api_key`, the secret, once) |
| `ApiKey.update(id, name)` | `PATCH /v3/api_keys/{id}` | `ApiKeyData` |
| `ApiKey.remove(id)` | `DELETE /v3/api_keys/{id}` | not decoded (`request`; `204`, empty) |
| `UserProfile.get()` | `GET /v3/user/profile` | `UserProfileData` |
| `UserProfile.update(partial)` | `PATCH /v3/user/profile` | `UserProfileData` |

Every id is interpolated with `encodeURIComponent`. Every helper requires `SendGrid.SendGridClient`, which `SendGrid.layer` / `layerConfig` provide alongside the `EmailService`.

A request `url` is a path on the configured host, starting with a single `/` (`/v3/stats`); the host comes only from `baseUrl` (`SENDGRID_BASE_URL`, e.g. `https://api.eu.sendgrid.com`). An absolute URL (`https://…`, any scheme), a protocol-relative `//host`, a path without its leading `/` (which, joined onto the base, would become part of the host) or a `baseUrl` that is not itself an absolute `http:` / `https:` URL fails with a `SendGridClientError` (`status: none`) before any request is made, so input that reaches `url` can never send the bearer token to another host. The host is what's pinned, not a path prefix on `baseUrl`: a `/..` segment can climb above one, so interpolate an untrusted id into a path with `encodeURIComponent`, as the built-in helpers do.

## Errors

| Error | When |
| --- | --- |
| `EmailSendError` (core) | A mail send failed. `provider: "sendgrid"`, `status: Option<number>`, the SendGrid error as `cause`. |
| `SendGridClientError` | A client request failed: `status: some(status)` with a truncated upstream body on any non-2xx (a 3xx included; an unreadable body still fails with the status), or when the body doesn't match the schema; `status: none` for a transport failure (a refused redirect included), a request body that can't be encoded as JSON, or a `url` that isn't a path on the configured host (checked before any request). |
| `InvalidApiKeyError` | The key given to `layer` is blank, or `SENDGRID_API_KEY` is unset or empty under `layerConfig`. Raised at call time, so the layer still builds. |

The credential never appears in an error message; a vendor error body is truncated to 200 characters before it is embedded.

The client pins `redirect: "error"` on the underlying fetch, layered over any `FetchHttpClient.RequestInit` defaults you provide (only `redirect` is overridden). Workers' default (`follow`) replays a request at the redirect target with the headers intact, so a 3xx from a hijacked host would hand the bearer token to whatever host the response named; no v3 call has a legitimate reason to redirect.

## Message mapping

| Core `EmailMessage` | SendGrid `POST /v3/mail/send`                    |
| ------------------- | ------------------------------------------------ |
| `from`, `replyTo`   | `from`, `reply_to`                               |
| `to`, `cc`, `bcc`   | one `personalizations[0]` entry                  |
| `text`, `html`      | `content` (`text/plain` first, then `text/html`) |
| `attachments`       | `attachments` with `disposition: "attachment"`   |
| `headers`           | `headers`                                        |
| `tags`              | `categories`                                     |

`toMailSendPayload(message)` is exported for callers that want to inspect or extend the payload (a dynamic-template send adds `template_id` and per-personalization `dynamic_template_data` through `SendGrid.request` directly).

## Testing a consumer

Provide `EmailService.layerRecording(sent)` from the core instead of this layer; nothing here needs to be stubbed. To exercise this package's own mapping, stand in an `HttpClient` (`HttpClient.make`) or a `FetchHttpClient.Fetch` stub.

## License

MIT
