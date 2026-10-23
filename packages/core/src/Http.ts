/**
 * The transport rules every provider applies to its vendor's HTTP API, in
 * one place: refuse redirects, bound a vendor error body, and describe a
 * failed request in one loggable line. Providers build their requests with
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
import type * as HttpClientError from "effect/http/HttpClientError";
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
