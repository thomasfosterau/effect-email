/**
 * Unit coverage for `./Http` — the transport rules the providers share. The
 * providers' own suites pin each rule end to end through a stubbed `fetch`;
 * this suite pins the helpers on their own.
 */

import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import {
  describeHttpError,
  describeHttpErrorWithoutUrl,
  executeWithSecretUrl,
  httpErrorStatus,
  isSuccessStatus,
  refuseRedirects,
  redactSecrets,
  rejectionMessage,
  UPSTREAM_BODY_LIMIT,
} from "../src/index.ts";

const request = HttpClientRequest.get("https://api.example.test/send");
const responseOf = (body: BodyInit | null, status: number) =>
  HttpClientResponse.fromWeb(request, new Response(body, { status }));

describe("refuseRedirects", () => {
  const inits: Array<RequestInit> = [];
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    inits.push(init ?? {});
    return new Response("{}");
  };
  const http = FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
  );
  const execute = Effect.flatMap(HttpClient.HttpClient, (client) => client.execute(request));

  it("pins redirect: error over the consumer's own RequestInit", async () => {
    await Effect.runPromise(
      refuseRedirects(execute).pipe(
        Effect.provide(http),
        Effect.provideService(FetchHttpClient.RequestInit, {
          credentials: "omit",
          redirect: "follow",
        }),
      ),
    );
    expect(inits.at(-1)?.redirect).toBe("error");
    expect(inits.at(-1)?.credentials).toBe("omit");
  });

  it("pins it when the consumer provides no RequestInit", async () => {
    await Effect.runPromise(refuseRedirects(execute).pipe(Effect.provide(http)));
    expect(inits.at(-1)?.redirect).toBe("error");
  });
});

describe("isSuccessStatus", () => {
  it("is true for 2xx only", () => {
    expect([199, 200, 204, 299, 300, 404].map(isSuccessStatus)).toEqual([
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});

describe("httpErrorStatus / describeHttpError", () => {
  it("reads the status of a StatusCodeError", () => {
    const error = new HttpClientError.HttpClientError({
      reason: new HttpClientError.StatusCodeError({ request, response: responseOf(null, 503) }),
    });
    expect(httpErrorStatus(error)).toStrictEqual(Option.some(503));
  });

  it("is none for a transport failure, described by the transport's own message", () => {
    const error = new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({ request, cause: new Error("network down") }),
    });
    expect(httpErrorStatus(error)).toStrictEqual(Option.none());
    expect(describeHttpError(error)).toBe("network down");
  });
});

describe("redactSecrets / describeHttpErrorWithoutUrl", () => {
  const secretRequest = HttpClientRequest.post("https://hooks.example.test/services/T1/B2/s3cr3t");

  it("replaces every occurrence of each non-empty secret", () => {
    expect(redactSecrets("a s3cr3t b s3cr3t", ["s3cr3t", ""])).toBe("a [redacted] b [redacted]");
    expect(redactSecrets("untouched", [])).toBe("untouched");
  });

  it("never carries the request URL, which Effect's own message does", () => {
    const error = new HttpClientError.HttpClientError({
      reason: new HttpClientError.StatusCodeError({
        request: secretRequest,
        response: HttpClientResponse.fromWeb(secretRequest, new Response(null, { status: 500 })),
      }),
    });
    expect(error.message).toContain("s3cr3t");
    expect(describeHttpError(error)).toContain("s3cr3t");
    expect(describeHttpErrorWithoutUrl(error, ["s3cr3t"])).toBe("StatusCodeError");
  });

  it("keeps a transport's own message, redacting the secrets in it", () => {
    const error = new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({
        request: secretRequest,
        cause: new Error("connect failed for /services/T1/B2/s3cr3t"),
      }),
    });
    expect(describeHttpErrorWithoutUrl(error, ["/services/T1/B2/s3cr3t"])).toBe(
      "connect failed for [redacted]",
    );
  });

  it("names the failure's kind for a transport failure without an Error cause", () => {
    const error = new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({ request: secretRequest, cause: "opaque" }),
    });
    expect(describeHttpErrorWithoutUrl(error, ["s3cr3t"])).toBe("TransportError");
  });
});

describe("executeWithSecretUrl", () => {
  const url = "https://hooks.example.test/services/T1/B2/s3cr3t";
  const run = (respond: () => Promise<Response>) => {
    const inits: Array<RequestInit> = [];
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      inits.push(init ?? {});
      return respond();
    };
    const effect = Effect.flatMap(HttpClient.HttpClient, (http) =>
      executeWithSecretUrl(http, HttpClientRequest.post(url), {
        label: "Vendor",
        secrets: [url, "/services/T1/B2/s3cr3t"],
        onFailure: (message, status) => ({ message, status }),
      }),
    ).pipe(
      Effect.provide(
        FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))),
      ),
    );
    return { inits, effect };
  };

  it("answers a 2xx response, with redirects refused", async () => {
    const { inits, effect } = run(async () => new Response("ok"));
    const response = await Effect.runPromise(effect);
    expect(response.status).toBe(200);
    expect(inits[0].redirect).toBe("error");
  });

  it("fails a non-2xx with the status and the redacted, truncated body", async () => {
    const { effect } = run(async () => new Response(`bad ${url}`, { status: 403 }));
    expect(await Effect.runPromise(Effect.flip(effect))).toStrictEqual({
      message: "Vendor rejected the request: 403 bad [redacted]",
      status: Option.some(403),
    });
  });

  it("fails a transport failure with no status and no URL", async () => {
    const { effect } = run(() => Promise.reject(new Error(`could not reach ${url}`)));
    expect(await Effect.runPromise(Effect.flip(effect))).toStrictEqual({
      message: "Vendor was unreachable: could not reach [redacted]",
      status: Option.none(),
    });
  });
});

describe("rejectionMessage", () => {
  it("names the status and a truncated body", async () => {
    const message = await Effect.runPromise(
      rejectionMessage(responseOf("x".repeat(5_000), 422), "Vendor rejected the send"),
    );
    expect(message).toBe(`Vendor rejected the send: 422 ${"x".repeat(UPSTREAM_BODY_LIMIT)}`);
  });

  it("names just the status for an empty body", async () => {
    expect(await Effect.runPromise(rejectionMessage(responseOf(null, 500), "Vendor"))).toBe(
      "Vendor: 500",
    );
  });

  it("names just the status when the body cannot be read", async () => {
    const broken = new ReadableStream({
      start(controller) {
        controller.error(new Error("stream already consumed"));
      },
    });
    expect(await Effect.runPromise(rejectionMessage(responseOf(broken, 500), "Vendor"))).toBe(
      "Vendor: 500",
    );
  });
});
