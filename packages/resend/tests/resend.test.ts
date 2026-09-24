/**
 * The Resend provider's suite: the transport properties the preferenceflow
 * application's `apps/auth/tests/email.test.ts` pins (fixed endpoint, bearer
 * credential, `redirect: "error"`, truncated error bodies, an unreadable
 * error body still failing with the status), the no-op transport's logging
 * discipline and the env resolver — ported onto the v4 core, with the
 * network stubbed at `FetchHttpClient.Fetch`. No test here reaches Resend.
 */

import { describe, expect, it } from "vite-plus/test";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import {
  EmailSendError,
  EmailService,
  UPSTREAM_BODY_LIMIT,
  type EmailMessage,
} from "@thomasfosterau/effect-email";
import {
  apiKeyFromEnv,
  formatAddress,
  layer,
  layerConfig,
  noop,
  resolveTransport,
  toResendPayload,
  type ResendEnv,
} from "../src/index.ts";

const VERIFY_URL = "https://example.test/api/auth/verify-email?token=secret-token-value";

const message = (
  to = "reader@example.test",
  subject = "Verify your email address",
): EmailMessage => ({
  from: { email: "noreply@example.test", name: "Example" },
  to: [{ email: to }],
  subject,
  text: `Confirm: ${VERIFY_URL}`,
  html: `<a href="${VERIFY_URL}">Confirm</a>`,
});

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit;
  readonly headers: Headers;
  readonly body: Schema.Json | undefined;
}

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Json));
/** Encodes a payload whose absent members are `undefined` — what JSON encoding drops. */
const encodePayload = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const textOf = (raw: BodyInit | null | undefined): string | undefined =>
  Predicate.isString(raw)
    ? raw
    : raw instanceof Uint8Array
      ? new TextDecoder().decode(raw)
      : undefined;
const Subjects = Schema.Array(Schema.Struct({ subject: Schema.String }));

/**
 * A stub `fetch` that records every call and replies with `respond`. The
 * recorded body is the JSON the client sent, decoded.
 */
const stubFetch = (respond: (request: CapturedRequest) => Response | Promise<Response>) => {
  const calls: Array<CapturedRequest> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const raw = init?.body;
    const captured: CapturedRequest = {
      url: String(input),
      init: init ?? {},
      headers,
      body: Option.map(Option.fromNullishOr(textOf(raw)), decodeJson).pipe(Option.getOrUndefined),
    };
    calls.push(captured);
    return respond(captured);
  };
  return {
    calls,
    /** `FetchHttpClient` over the stub. */
    http: FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))),
  };
};

const json = (body: Schema.Json, status = 200): Response =>
  new Response(encodeJson(body), { status, headers: { "content-type": "application/json" } });

const API_KEY = "test-api-key";

const sendWith = (
  http: Layer.Layer<HttpClient.HttpClient>,
  apiKey = API_KEY,
  input: EmailMessage = message(),
) =>
  Effect.flatMap(EmailService, (email) => email.send(input)).pipe(
    Effect.provide(layer({ apiKey: Redacted.make(apiKey) }).pipe(Layer.provide(http))),
  );

describe("EmailService.send", () => {
  it("POSTs the message to Resend's fixed endpoint with a bearer credential", async () => {
    const stub = stubFetch(() => json({ id: "email_1" }));
    const result = await Effect.runPromise(sendWith(stub.http));

    expect(result.id).toStrictEqual(Option.some("email_1"));
    expect(stub.calls).toHaveLength(1);
    const [request] = stub.calls;
    // A compile-time-constant host: nothing derived from input may steer it.
    expect(request.url).toBe("https://api.resend.com/emails");
    expect(request.init.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(request.headers.get("content-type")).toContain("application/json");
    expect(request.body).toEqual({
      from: "Example <noreply@example.test>",
      to: ["reader@example.test"],
      subject: "Verify your email address",
      text: `Confirm: ${VERIFY_URL}`,
      html: `<a href="${VERIFY_URL}">Confirm</a>`,
    });
  });

  it("refuses to follow redirects, so a 3xx can never carry the bearer token elsewhere", async () => {
    const stub = stubFetch(() => json({ id: "email_1" }));
    await Effect.runPromise(sendWith(stub.http));
    expect(stub.calls[0].init.redirect).toBe("error");
  });

  it("layers the redirect refusal over the consumer's own RequestInit defaults", async () => {
    const stub = stubFetch(() => json({ id: "email_1" }));
    await Effect.runPromise(
      sendWith(stub.http).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, { credentials: "omit" }),
      ),
    );
    expect(stub.calls[0].init.redirect).toBe("error");
    expect(stub.calls[0].init.credentials).toBe("omit");
  });

  it("fails with EmailSendError on a non-2xx, truncating the upstream body", async () => {
    const stub = stubFetch(() => new Response("x".repeat(5_000), { status: 422 }));
    const error = await Effect.runPromise(Effect.flip(sendWith(stub.http)));

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error.provider).toBe("resend");
    expect(error.status).toStrictEqual(Option.some(422));
    expect(error.message).toMatch(/422/);
    // Bounded: a vendor error body can echo request context back, so it
    // must never be embedded raw and unbounded in an error message.
    expect(error.message.length).toBeLessThan(UPSTREAM_BODY_LIMIT + 100);
    expect(error.message).not.toContain(API_KEY);
  });

  it("still fails with the status when the error body cannot be read", async () => {
    const stub = stubFetch(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("stream already consumed"));
            },
          }),
          { status: 500 },
        ),
    );
    const error = await Effect.runPromise(Effect.flip(sendWith(stub.http)));
    expect(error.status).toStrictEqual(Option.some(500));
    expect(error.message).toMatch(/500/);
  });

  it("fails with EmailSendError and no status when Resend is unreachable", async () => {
    const stub = stubFetch(() => Promise.reject(new Error("network down")));
    const error = await Effect.runPromise(Effect.flip(sendWith(stub.http)));
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error.status).toStrictEqual(Option.none());
    expect(error.message).toContain("unreachable");
  });

  it("fails when a 2xx body is not the shape Resend documents", async () => {
    const stub = stubFetch(() => json({ ok: true }));
    const error = await Effect.runPromise(Effect.flip(sendWith(stub.http)));
    expect(error.status).toStrictEqual(Option.some(200));
    expect(error.message).toContain("unexpected body");
  });

  it("honours a baseUrl override for a stub server", async () => {
    const stub = stubFetch(() => json({ id: "email_1" }));
    await Effect.runPromise(
      Effect.flatMap(EmailService, (email) => email.send(message())).pipe(
        Effect.provide(
          layer({ apiKey: Redacted.make(API_KEY), baseUrl: "https://stub.local/api" }).pipe(
            Layer.provide(stub.http),
          ),
        ),
      ),
    );
    expect(stub.calls[0].url).toBe("https://stub.local/api/emails");
  });
});

describe("EmailService.sendBatch", () => {
  it("POSTs every message to /emails/batch in one request and maps the ids back in order", async () => {
    const stub = stubFetch(() => json({ data: [{ id: "email_1" }, { id: "email_2" }] }));
    const results = await Effect.runPromise(
      Effect.flatMap(EmailService, (email) =>
        email.sendBatch([message("a@example.test", "one"), message("b@example.test", "two")]),
      ).pipe(
        Effect.provide(layer({ apiKey: Redacted.make(API_KEY) }).pipe(Layer.provide(stub.http))),
      ),
    );
    expect(results.map((result) => result.id)).toStrictEqual([
      Option.some("email_1"),
      Option.some("email_2"),
    ]);
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0].url).toBe("https://api.resend.com/emails/batch");
    expect(
      Schema.decodeUnknownSync(Subjects)(stub.calls[0].body).map((entry) => entry.subject),
    ).toEqual(["one", "two"]);
  });

  it("makes no request for an empty batch", async () => {
    const stub = stubFetch(() => json({ data: [] }));
    const results = await Effect.runPromise(
      Effect.flatMap(EmailService, (email) => email.sendBatch([])).pipe(
        Effect.provide(layer({ apiKey: Redacted.make(API_KEY) }).pipe(Layer.provide(stub.http))),
      ),
    );
    expect(results).toEqual([]);
    expect(stub.calls).toHaveLength(0);
  });
});

describe("toResendPayload", () => {
  it("formats recipients as `Name <address>` and maps the whole envelope", () => {
    expect(
      toResendPayload({
        from: { email: "noreply@example.test", name: "Example" },
        to: [{ email: "a@example.test", name: "A" }, { email: "b@example.test" }],
        cc: [{ email: "c@example.test" }],
        bcc: [{ email: "d@example.test", name: "D" }],
        replyTo: { email: "reply@example.test" },
        subject: "s",
        text: "t",
        html: "<p>h</p>",
        headers: { "X-Entity-Ref-ID": "abc" },
        attachments: [{ filename: "a.txt", content: "YQ==", contentType: "text/plain" }],
        tags: ["welcome"],
      }),
    ).toEqual({
      from: "Example <noreply@example.test>",
      to: ["A <a@example.test>", "b@example.test"],
      cc: ["c@example.test"],
      bcc: ["D <d@example.test>"],
      reply_to: ["reply@example.test"],
      subject: "s",
      text: "t",
      html: "<p>h</p>",
      headers: { "X-Entity-Ref-ID": "abc" },
      attachments: [{ filename: "a.txt", content: "YQ==", content_type: "text/plain" }],
      tags: [{ name: "welcome", value: "welcome" }],
    });
  });

  it("drops absent fields from the JSON it sends", () => {
    const payload = toResendPayload({
      from: { email: "noreply@example.test" },
      to: [{ email: "a@example.test" }],
      subject: "s",
      text: "t",
    });
    expect(decodeJson(encodePayload(payload))).toEqual({
      from: "noreply@example.test",
      to: ["a@example.test"],
      subject: "s",
      text: "t",
    });
  });

  it("formatAddress uses the bare address when there is no display name", () => {
    expect(formatAddress({ email: "a@example.test" })).toBe("a@example.test");
    expect(formatAddress({ email: "a@example.test", name: "A B" })).toBe("A B <a@example.test>");
  });
});

/** Runs `effect` under a logger that collects every log line. */
const withCapturedLogs = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const lines: Array<string> = [];
  const collecting = Logger.make(({ message }) => {
    lines.push(String(message));
  });
  return { lines, effect: effect.pipe(Effect.provide(Logger.layer([collecting]))) };
};

describe("noop", () => {
  it("succeeds without an id, so an un-provisioned stage still signs users up", async () => {
    const { effect } = withCapturedLogs(
      Effect.flatMap(EmailService, (email) => email.send(message())).pipe(Effect.provide(noop)),
    );
    const result = await Effect.runPromise(effect);
    expect(result.id).toStrictEqual(Option.none());
  });

  it("logs neither the verification URL (the token) nor the recipient (PII)", async () => {
    const { effect, lines } = withCapturedLogs(
      Effect.flatMap(EmailService, (email) => email.send(message())).pipe(Effect.provide(noop)),
    );
    await Effect.runPromise(effect);
    const logged = lines.join(" ");
    // Enough to diagnose "mail is being dropped for want of a credential"…
    expect(logged).toContain("RESEND_API_KEY");
    expect(logged).toContain("Verify your email address");
    // …without accumulating every stage signup's address in Worker logs, or
    // ever writing the token-bearing URL.
    expect(logged).not.toContain("reader@example.test");
    expect(logged).not.toContain(VERIFY_URL);
    expect(logged).not.toContain("secret-token-value");
  });

  it("drops a batch one message at a time, answering one result per message", async () => {
    const { effect, lines } = withCapturedLogs(
      Effect.flatMap(EmailService, (email) =>
        email.sendBatch([message("a@example.test", "one"), message("b@example.test", "two")]),
      ).pipe(Effect.provide(noop)),
    );
    const results = await Effect.runPromise(effect);
    expect(results).toHaveLength(2);
    expect(lines).toHaveLength(2);
  });
});

describe("apiKeyFromEnv", () => {
  it("is none for an absent, null, empty or blank binding", () => {
    expect(apiKeyFromEnv({})).toStrictEqual(Option.none());
    expect(apiKeyFromEnv({ RESEND_API_KEY: undefined })).toStrictEqual(Option.none());
    expect(apiKeyFromEnv({ RESEND_API_KEY: null })).toStrictEqual(Option.none());
    expect(apiKeyFromEnv({ RESEND_API_KEY: "" })).toStrictEqual(Option.none());
    expect(apiKeyFromEnv({ RESEND_API_KEY: "   " })).toStrictEqual(Option.none());
  });

  it("accepts a plain string or an already-redacted key", () => {
    expect(Option.map(apiKeyFromEnv({ RESEND_API_KEY: "re_a" }), Redacted.value)).toStrictEqual(
      Option.some("re_a"),
    );
    expect(
      Option.map(apiKeyFromEnv({ RESEND_API_KEY: Redacted.make("re_b") }), Redacted.value),
    ).toStrictEqual(Option.some("re_b"));
  });
});

describe("resolveTransport", () => {
  const env = (key: Option.Option<string>): ResendEnv => ({
    RESEND_API_KEY: Option.getOrUndefined(key),
  });

  it("returns the no-op transport when no credential is configured", () => {
    expect(resolveTransport(env(Option.none()))).toBe(noop);
  });

  it("treats an empty string as no credential", () => {
    // A stage could bind `""` by hand. A blank check is what makes that the
    // same case as "unset"; a `!== undefined` test would build a real
    // transport around an empty bearer token.
    expect(resolveTransport(env(Option.some("")))).toBe(noop);
  });

  it("returns a live transport once a credential is present", () => {
    expect(resolveTransport(env(Option.some("re_test_key")))).not.toBe(noop);
  });

  it("hands the live transport the configured key, over the platform fetch", async () => {
    const calls: Array<CapturedRequest> = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({
        url: String(input),
        init: init ?? {},
        headers: new Headers(init?.headers),
        body: undefined,
      });
      return json({ id: "email_1" });
    };
    await Effect.runPromise(
      Effect.flatMap(EmailService, (email) => email.send(message())).pipe(
        Effect.provide(resolveTransport(env(Option.some("re_live_key")))),
        // The fiber's `Fetch` wins over the layer's default (`globalThis.fetch`).
        Effect.provideService(FetchHttpClient.Fetch, fetch),
      ),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.get("authorization")).toBe("Bearer re_live_key");
    expect(calls[0].init.redirect).toBe("error");
  });
});

describe("layerConfig", () => {
  it("reads RESEND_API_KEY and RESEND_BASE_URL through effect/Config", async () => {
    const stub = stubFetch(() => json({ id: "email_1" }));
    await Effect.runPromise(
      Effect.flatMap(EmailService, (email) => email.send(message())).pipe(
        Effect.provide(
          layerConfig.pipe(
            Layer.provide(stub.http),
            Layer.provide(
              ConfigProvider.layer(
                ConfigProvider.fromUnknown({
                  RESEND_API_KEY: "re_from_config",
                  RESEND_BASE_URL: "https://stub.local",
                }),
              ),
            ),
          ),
        ),
      ),
    );
    expect(stub.calls[0].url).toBe("https://stub.local/emails");
    expect(stub.calls[0].headers.get("authorization")).toBe("Bearer re_from_config");
  });

  it("fails at layer construction when RESEND_API_KEY is missing", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(EmailService, (email) => email.send(message())).pipe(
        Effect.provide(
          layerConfig.pipe(
            Layer.provide(FetchHttpClient.layer),
            Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
          ),
        ),
      ),
    );
    expect(exit._tag).toBe("Failure");
  });
});
