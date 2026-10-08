/**
 * Network stubs for the SendGrid suite. `stubHttp` is a recording
 * `HttpClient`: every request the client builds is captured (method, resolved
 * URL, headers, query, decoded JSON body) and answered from a scripted reply.
 * `stubFetch` stands in one level lower, at `FetchHttpClient.Fetch`, for the
 * properties only the real fetch client sees (the `RequestInit` the client
 * pins). No test here reaches the network.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import * as Str from "effect/String";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import type * as Headers from "effect/http/Headers";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as UrlParams from "effect/http/UrlParams";

/** One captured request. */
export interface RecordedRequest {
  readonly method: string;
  /** The resolved URL, query string included. */
  readonly url: string;
  readonly headers: Headers.Headers;
  readonly query: Record<string, string | ReadonlyArray<string>>;
  /** The JSON body, decoded; `undefined` when the request had none. */
  readonly body: Schema.Json | undefined;
}

/** A scripted reply. `body` is JSON-encoded; omit it for an empty body. */
export interface StubReply {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const bodyOf = (request: HttpClientRequest.HttpClientRequest): Schema.Json | undefined => {
  if (request.body._tag !== "Uint8Array") return undefined;
  const text = new TextDecoder().decode(request.body.body);
  return Str.isEmpty(text) ? undefined : decodeJson(text);
};

/**
 * Build a stub that answers every request with `reply` (a value, or a
 * function of the captured request). Returns the captured requests and the
 * Layer providing the stub as `HttpClient`.
 */
export const stubHttp = (reply: StubReply | ((request: RecordedRequest) => StubReply)) => {
  const requests: Array<RecordedRequest> = [];
  const client = HttpClient.make((request, url) =>
    Effect.sync(() => {
      const recorded: RecordedRequest = {
        method: request.method,
        url: url.toString(),
        headers: request.headers,
        query: UrlParams.toRecord(request.urlParams),
        body: bodyOf(request),
      };
      requests.push(recorded);
      const answer = Predicate.isFunction(reply) ? reply(recorded) : reply;
      return HttpClientResponse.fromWeb(
        request,
        new Response(answer.body === undefined ? null : encodeJson(answer.body), {
          status: answer.status,
          headers: { "content-type": "application/json", ...answer.headers },
        }),
      );
    }),
  );
  return { requests, layer: Layer.succeed(HttpClient.HttpClient, client) };
};

/** A stub whose transport fails before any response: the network is down. */
export const unreachableHttp = (message: string): Layer.Layer<HttpClient.HttpClient> =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request, cause: new Error(message) }),
        }),
      ),
    ),
  );

/** One `fetch` call as the stub saw it. */
export interface FetchCall {
  readonly url: string;
  /** The `RequestInit` the fetch client passed: the consumer's defaults merged with the request's own fields. */
  readonly init: RequestInit;
}

/**
 * A stub `fetch` under the real `FetchHttpClient`: records every call and
 * answers with `respond`. Returns the calls and the Layer providing
 * `FetchHttpClient.layer` over the stub as `HttpClient`.
 */
export const stubFetch = (respond: (call: FetchCall) => Response | Promise<Response>) => {
  const calls: Array<FetchCall> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const call: FetchCall = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call);
  };
  return {
    calls,
    layer: FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))),
  };
};
