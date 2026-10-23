/**
 * The transport rules every provider applies to its vendor's HTTP API, in
 * one place: refuse redirects, bound a vendor error body, describe a failed
 * request in one loggable line, and keep a credential that is part of the
 * request URL (an incoming webhook) out of every message. Providers build their requests with
 * Effect's `HttpClient` (`effect/http`) and pass them through these helpers;
 * nothing here names a vendor.
 *
 * @module Http
 * @since 0.1.0
 */

import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Str from "effect/String";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import type * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientError from "effect/http/HttpClientError";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import { truncateUpstreamBody } from "./Errors.ts";

/**
 * Run `effect` with `redirect: "error"` pinned on the underlying `fetch`.
 *
 * Workers' default (`follow`) replays a request at the redirect target
 * **with the headers intact** — it does not drop `Authorization` on a
 * cross-origin hop the way a browser does — so a 3xx from a hijacked or
 * misconfigured vendor host would hand the credential to whatever host the
 * response named. A vendor API call has no legitimate reason to redirect, so
 * the request fails instead (SEC-SECRET-001 in the consuming applications).
 *
 * Layered over whatever `FetchHttpClient.RequestInit` the consumer already
 * provides, so a `credentials` or `cache` setting survives; only `redirect`
 * is pinned. Harmless under a non-fetch `HttpClient`, which never reads it.
 *
 * @since 0.1.0
 */
export const refuseRedirects = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.flatMap(Effect.serviceOption(FetchHttpClient.RequestInit), (existing) =>
    effect.pipe(
      Effect.provideService(FetchHttpClient.RequestInit, {
        ...Option.getOrElse(existing, () => ({})),
        redirect: "error",
      }),
    ),
  );

/**
 * Whether an HTTP status is a 2xx.
 *
 * @since 0.1.0
 */
export const isSuccessStatus = (status: number): boolean => status >= 200 && status < 300;

/**
 * The vendor's status when it answered at all (a `StatusCodeError`), else
 * `none` — the `status` a send error carries.
 *
 * @since 0.1.0
 */
export const httpErrorStatus = (error: HttpClientError.HttpClientError): Option.Option<number> =>
  error.reason._tag === "StatusCodeError"
    ? Option.some(error.reason.response.status)
    : Option.none();

/**
 * A failed request in one line: the transport's own message when there is
 * one (a `fetch` rejection names the network failure), else Effect's.
 *
 * @since 0.1.0
 */
export const describeHttpError = (error: HttpClientError.HttpClientError): string =>
  Match.value(error.reason).pipe(
    Match.tag("TransportError", (reason) =>
      Predicate.isError(reason.cause) ? reason.cause.message : error.message,
    ),
    Match.orElse(() => error.message),
  );

/**
 * `text` with every occurrence of each non-empty `secret` replaced by
 * `[redacted]` — the last line of defence for a provider whose credential is
 * part of the request URL (an incoming webhook), applied to any message it
 * composes from text it does not control.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import { redactSecrets } from "@thomasfosterau/effect-connect";
 *
 * assert.strictEqual(
 *   redactSecrets("POST https://hooks.example.test/s3cr3t failed", ["s3cr3t", ""]),
 *   "POST https://hooks.example.test/[redacted] failed",
 * );
 * ```
 *
 * @since 0.1.0
 */
export const redactSecrets = (text: string, secrets: ReadonlyArray<string>): string =>
  secrets
    .filter(Str.isNonEmpty)
    .reduce((acc, secret) => acc.split(secret).join("[redacted]"), text);

/**
 * A failed request in one line that **never names the request**: the
 * transport's own message when there is one (a `fetch` rejection names the
 * network failure), else the failure's kind (`TransportError`,
 * `InvalidUrlError`, …), with each of `secrets` redacted
 * ({@link redactSecrets}) either way.
 *
 * {@link describeHttpError} falls back on Effect's own `HttpClientError`
 * message, which carries the request's method and URL. A provider whose URL
 * is the credential (an incoming webhook: the token is a path segment) uses
 * this instead, passing the secret parts of the URL as `secrets`.
 *
 * @since 0.1.0
 */
export const describeHttpErrorWithoutUrl = (
  error: HttpClientError.HttpClientError,
  secrets: ReadonlyArray<string>,
): string =>
  redactSecrets(
    error.reason._tag === "TransportError" && Predicate.isError(error.reason.cause)
      ? error.reason.cause.message
      : error.reason._tag,
    secrets,
  );

/**
 * The message for a vendor's non-2xx answer: `<prefix>: <status>`, then the
 * response body **truncated** to `UPSTREAM_BODY_LIMIT` characters. A vendor
 * error response can echo request context back, so the body is bounded
 * before it can reach a log line; a body that cannot be read leaves just the
 * status. Never fails.
 *
 * @example
 * ```ts
 * import * as assert from "node:assert";
 * import * as Effect from "effect/Effect";
 * import * as HttpClientRequest from "effect/http/HttpClientRequest";
 * import * as HttpClientResponse from "effect/http/HttpClientResponse";
 * import { rejectionMessage } from "@thomasfosterau/effect-connect";
 *
 * const response = HttpClientResponse.fromWeb(
 *   HttpClientRequest.get("https://api.example.test/send"),
 *   new Response("x".repeat(1_000), { status: 422 }),
 * );
 * const message = await Effect.runPromise(rejectionMessage(response, "Example rejected the send"));
 *
 * assert.ok(message.startsWith("Example rejected the send: 422 xxx"));
 * assert.strictEqual(message.length, "Example rejected the send: 422 ".length + 200);
 * ```
 *
 * @since 0.1.0
 */
export const rejectionMessage = (
  response: HttpClientResponse.HttpClientResponse,
  prefix: string,
): Effect.Effect<string> =>
  response.text.pipe(
    Effect.map(truncateUpstreamBody),
    Effect.catchTag("HttpClientError", () => Effect.succeed("")),
    Effect.map((detail) =>
      Str.isEmpty(detail)
        ? `${prefix}: ${response.status}`
        : `${prefix}: ${response.status} ${detail}`,
    ),
  );

/**
 * What {@link executeWithSecretUrl} needs to name a failure.
 *
 * @since 0.1.0
 */
export interface SecretUrlRequestOptions<E> {
  /** The vendor's name, as each message starts: `<label> was unreachable: …`, `<label> rejected the request: …`. */
  readonly label: string;
  /** The parts of the request URL that are the credential, longest first (the whole URL, then its path, then a bare token); each is redacted from every message. */
  readonly secrets: ReadonlyArray<string>;
  /** The provider's error, from a message safe to log and the vendor's status (`none` for a transport failure). */
  readonly onFailure: (message: string, status: Option.Option<number>) => E;
}

/**
 * Execute a request whose URL carries the credential (an incoming webhook,
 * where the token is a path segment), answering the response on a 2xx. A
 * redirect is refused ({@link refuseRedirects}); a transport failure fails
 * with {@link describeHttpErrorWithoutUrl}'s line and `none`; a non-2xx
 * fails with {@link rejectionMessage}'s status and truncated body, redacted
 * ({@link redactSecrets}), and the status. Neither message ever names the
 * request URL, and `onFailure` is never handed the `HttpClientError`, whose
 * request carries it.
 *
 * @since 0.1.0
 */
export const executeWithSecretUrl = <E>(
  http: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  options: SecretUrlRequestOptions<E>,
): Effect.Effect<HttpClientResponse.HttpClientResponse, E> =>
  http.execute(request).pipe(
    refuseRedirects,
    Effect.mapError((error) =>
      options.onFailure(
        `${options.label} was unreachable: ${describeHttpErrorWithoutUrl(error, options.secrets)}`,
        httpErrorStatus(error),
      ),
    ),
    Effect.flatMap((response) =>
      isSuccessStatus(response.status)
        ? Effect.succeed(response)
        : Effect.flatMap(
            rejectionMessage(response, `${options.label} rejected the request`),
            (message) =>
              Effect.fail(
                options.onFailure(
                  redactSecrets(message, options.secrets),
                  Option.some(response.status),
                ),
              ),
          ),
    ),
  );
