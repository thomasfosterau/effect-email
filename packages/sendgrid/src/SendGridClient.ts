/**
 * The generic SendGrid v3 REST client: one `request` seam every resource
 * namespace and the mail sender go through, over Effect's `HttpClient`.
 *
 * The bearer token is set from the `Redacted` key on every request; Effect's
 * tracer redacts `authorization` from spans by default. The properties the
 * client pins, as the Resend provider does:
 *
 * - `redirect: "error"` on the underlying `fetch`, layered over the
 *   consumer's own `FetchHttpClient.RequestInit`. Workers' default (`follow`)
 *   replays the request at the redirect target **with the headers intact**,
 *   so a 3xx from a hijacked or misconfigured SendGrid host would hand the
 *   bearer token to whatever host the response named. No SendGrid v3 call has
 *   a legitimate reason to redirect, so a refused redirect fails as a
 *   transport {@link SendGridClientError} (`status: none`);
 * - any non-2xx answer, a 3xx included, becomes a {@link SendGridClientError}
 *   carrying the status and a **truncated** body; a body that cannot be read
 *   still fails with the status.
 *
 * @module SendGridClient
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Str from "effect/String";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import { truncateUpstreamBody } from "@thomasfosterau/effect-email";
import { InvalidApiKeyError, SendGridClientError } from "./Errors.ts";
import { SendGridConfig } from "./SendGridConfig.ts";

/** The HTTP methods SendGrid's v3 API uses. */
export type ClientMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/* oxlint-disable effect/prefer-option-over-null -- a consumer-facing request input: an omitted `body` / `qs` / `headers` key IS "not sent", exactly as the wire has it */
/** One SendGrid API request. `url` is a path (`/v3/templates`) or an absolute URL. */
export interface ClientRequest {
  readonly url: string;
  readonly method: ClientMethod;
  /** A JSON body. Omitted for requests without one. */
  readonly body?: unknown;
  /** Query-string parameters. */
  readonly qs?: Readonly<Record<string, string | number | boolean>>;
  /** Extra headers. `authorization` and `accept` are set by the client. */
  readonly headers?: Readonly<Record<string, string>>;
}
/* oxlint-enable effect/prefer-option-over-null */

/**
 * A response body as the client hands it back before decoding: the parsed
 * JSON, `undefined` when the response had none (SendGrid answers `202` /
 * `204` with an empty body), or the raw text when it was not JSON.
 */
// oxlint-disable-next-line effect/prefer-option-over-null -- the raw wire body: "no body" is what `204` has, and every caller that wants a typed value goes through `requestJson`
export type ClientResponseBody = Schema.Json | undefined;

/** One SendGrid API response. `body` is the raw {@link ClientResponseBody} until `requestJson` decodes it. */
export interface ClientResponse<A = ClientResponseBody> {
  readonly status: number;
  readonly body: A;
  readonly headers: Readonly<Record<string, string>>;
}

/** The generic SendGrid REST client as a service. */
export class SendGridClient extends Context.Service<
  SendGridClient,
  {
    /**
     * Perform one request. `body` is the raw {@link ClientResponseBody}:
     * parsed JSON, the text when it isn't JSON, `undefined` when empty.
     */
    readonly request: (
      request: ClientRequest,
    ) => Effect.Effect<ClientResponse, SendGridClientError | InvalidApiKeyError>;
    /** Perform one request and decode the JSON body with `schema`. */
    readonly requestJson: <A, I>(
      schema: Schema.Codec<A, I>,
    ) => (
      request: ClientRequest,
    ) => Effect.Effect<ClientResponse<A>, SendGridClientError | InvalidApiKeyError>;
  }
>()("@thomasfosterau/effect-email-sendgrid/SendGridClient") {
  /** The live client over the `HttpClient` and {@link SendGridConfig} in context. */
  static readonly layer: Layer.Layer<
    SendGridClient,
    never,
    SendGridConfig | HttpClient.HttpClient
  > = Layer.effect(SendGridClient, makeClient());
}

const isAbsoluteUrl = (url: string): boolean => /^https?:\/\//i.test(url);

/** SendGrid's status when it answered at all, else `none`. */
const statusOf = (error: HttpClientError.HttpClientError): Option.Option<number> =>
  error.reason._tag === "StatusCodeError"
    ? Option.some(error.reason.response.status)
    : Option.none();

/** The transport's own message when there is one (a `fetch` rejection), else Effect's. */
const describeHttpError = (error: HttpClientError.HttpClientError): string =>
  Match.value(error.reason).pipe(
    Match.tag("TransportError", (reason) =>
      Predicate.isError(reason.cause) ? reason.cause.message : error.message,
    ),
    Match.orElse(() => error.message),
  );

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

const fromHttpClientError = (error: HttpClientError.HttpClientError): SendGridClientError =>
  new SendGridClientError({
    message: `SendGrid API request failed: ${describeHttpError(error)}`,
    status: statusOf(error),
    cause: error,
  });

const decodeJsonText = Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Json));

/** An empty body is `undefined`; JSON is parsed; anything else is the raw text. */
const parseBody = (text: string): ClientResponseBody =>
  Str.isEmpty(text) ? undefined : Result.getOrElse(decodeJsonText(text), () => text);

function makeClient() {
  return Effect.gen(function* () {
    const config = yield* SendGridConfig;
    const http = yield* HttpClient.HttpClient;

    const validateApiKey: Effect.Effect<void, InvalidApiKeyError> = Str.isEmpty(
      Redacted.value(config.apiKey).trim(),
    )
      ? Effect.fail(
          new InvalidApiKeyError({ message: "SendGrid API key is required and cannot be empty" }),
        )
      : Effect.void;

    const request = Effect.fn("SendGridClient.request")(function* (clientRequest: ClientRequest) {
      yield* validateApiKey;
      const url = isAbsoluteUrl(clientRequest.url)
        ? clientRequest.url
        : `${config.baseUrl}${clientRequest.url}`;
      const base = HttpClientRequest.make(clientRequest.method)(url, {
        headers: clientRequest.headers,
        urlParams: clientRequest.qs,
        acceptJson: true,
      }).pipe(HttpClientRequest.bearerToken(config.apiKey));
      const withBody =
        clientRequest.body === undefined
          ? base
          : yield* HttpClientRequest.bodyJson(base, clientRequest.body).pipe(
              Effect.mapError(
                (cause) =>
                  new SendGridClientError({
                    message: "SendGrid API request body could not be encoded as JSON",
                    status: Option.none(),
                    cause,
                  }),
              ),
            );
      const response = yield* http
        .execute(withBody)
        .pipe(withRedirectRefused, Effect.mapError(fromHttpClientError));
      if (!isSuccess(response.status)) {
        // A vendor error response is exactly the kind of thing that can echo
        // request context back, so it is truncated before it can reach a
        // log line — and a body that cannot be read still fails with the status.
        const detail = yield* response.text.pipe(
          Effect.map(truncateUpstreamBody),
          Effect.catchTag("HttpClientError", () => Effect.succeed("")),
        );
        return yield* new SendGridClientError({
          message: Str.isEmpty(detail)
            ? `SendGrid API request failed: ${response.status}`
            : `SendGrid API request failed: ${response.status} ${detail}`,
          status: Option.some(response.status),
        });
      }
      const text = yield* response.text.pipe(Effect.mapError(fromHttpClientError));
      const result: ClientResponse = {
        status: response.status,
        body: parseBody(text),
        headers: response.headers,
      };
      return result;
    });

    const requestJson =
      <A, I>(schema: Schema.Codec<A, I>) =>
      (clientRequest: ClientRequest) =>
        Effect.gen(function* () {
          const response = yield* request(clientRequest);
          const body = yield* Schema.decodeUnknownEffect(schema)(response.body).pipe(
            Effect.mapError(
              (cause) =>
                new SendGridClientError({
                  message: `SendGrid API response did not match the expected shape: ${cause.message}`,
                  status: Option.some(response.status),
                  cause,
                }),
            ),
          );
          const decoded: ClientResponse<A> = {
            status: response.status,
            body,
            headers: response.headers,
          };
          return decoded;
        });

    return { request, requestJson };
  });
}

/** Perform one request through the {@link SendGridClient} in context. */
export const request = (
  clientRequest: ClientRequest,
): Effect.Effect<ClientResponse, SendGridClientError | InvalidApiKeyError, SendGridClient> =>
  Effect.flatMap(SendGridClient, (client) => client.request(clientRequest));

/** Perform one request through the {@link SendGridClient} in context, decoding the body. */
export const requestJson =
  <A, I>(schema: Schema.Codec<A, I>) =>
  (
    clientRequest: ClientRequest,
  ): Effect.Effect<ClientResponse<A>, SendGridClientError | InvalidApiKeyError, SendGridClient> =>
    Effect.flatMap(SendGridClient, (client) => client.requestJson(schema)(clientRequest));
