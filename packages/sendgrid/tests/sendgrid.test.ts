/**
 * The SendGrid provider's suite: the `effect-sendgrid` corpus (layer
 * construction, the empty-key posture, single and multiple sends, the
 * batched namespace API, the generic client's verbs / query / headers /
 * error status extraction, and every resource namespace) ported onto the v4
 * core and Effect's `HttpClient`, plus the mail-payload mapping the port
 * introduces, and the transport properties shared with the Resend provider
 * (`redirect: "error"`, a failure on every non-2xx). The network is stubbed
 * at the `HttpClient` seam, or at `FetchHttpClient.Fetch` where the test is
 * about what the fetch client sees.
 */

import { describe, expect, it } from "vite-plus/test";
import * as Arr from "effect/Array";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import {
  EmailSendError,
  EmailService,
  UPSTREAM_BODY_LIMIT,
  type EmailMessage,
} from "@thomasfosterau/effect-email";
import {
  ApiKey,
  Contact,
  InvalidApiKeyError,
  layer,
  layerConfig,
  request,
  send,
  SendGridClient,
  SendGridClientError,
  sendMany,
  Template,
  toMailSendPayload,
  UserProfile,
  type ClientRequest,
} from "../src/index.ts";
import {
  stubFetch,
  stubHttp,
  unreachableHttp,
  type RecordedRequest,
  type StubReply,
} from "./stub-http.ts";

const API_KEY = "test-api-key";

const message = (to: string, subject = "Test Email"): EmailMessage => ({
  from: { email: "sender@example.com" },
  to: [{ email: to }],
  subject,
  text: "This is a test email",
});

type Reply = StubReply | ((request: RecordedRequest) => StubReply);

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));
/** Encodes a payload whose absent members are `undefined` — what JSON encoding drops. */
const encodePayload = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** The `subject` of a captured mail-send body. */
const subjectOf = (sent: RecordedRequest): string =>
  Schema.decodeUnknownSync(Schema.Struct({ subject: Schema.String }))(sent.body).subject;

/** The `content` parts of a captured mail-send body. */
const contentOf = (sent: RecordedRequest) =>
  Schema.decodeUnknownSync(Schema.Struct({ content: Schema.Json }))(sent.body).content;

/** Narrows a client failure to the `SendGridClientError` case, failing the test otherwise. */
const asClientError = (error: SendGridClientError | InvalidApiKeyError): SendGridClientError => {
  if (Schema.is(SendGridClientError)(error)) return error;
  throw new Error(`expected a SendGridClientError, got ${error._tag}`);
};

/** The provider over a stub that answers `reply`, with the given key. */
const provider = (reply: Reply, apiKey = API_KEY) => {
  const stub = stubHttp(reply);
  return {
    requests: stub.requests,
    layer: layer({ apiKey: Redacted.make(apiKey) }).pipe(Layer.provide(stub.layer)),
  };
};

const accepted: StubReply = { status: 202, headers: { "x-message-id": "msg-123" } };

describe("layer", () => {
  it("builds the EmailService and the client with a valid API key", async () => {
    const { layer } = provider(accepted);
    const services = await Effect.runPromise(
      Effect.all([EmailService, SendGridClient], { concurrency: 1 }).pipe(Effect.provide(layer)),
    );
    expect(services).toHaveLength(2);
  });

  it("builds with an empty API key, and fails at send time", async () => {
    const { layer, requests } = provider(accepted, "");
    const error = await Effect.runPromise(
      Effect.flip(send(message("recipient@example.com"))).pipe(Effect.provide(layer)),
    );
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error.provider).toBe("sendgrid");
    expect(error.cause).toBeInstanceOf(InvalidApiKeyError);
    expect(error.message).toContain("API key");
    expect(requests).toHaveLength(0);
  });
});

describe("layerConfig", () => {
  const configured = (env: Record<string, string>, reply: Reply = accepted) => {
    const stub = stubHttp(reply);
    return {
      requests: stub.requests,
      layer: layerConfig.pipe(
        Layer.provide(stub.layer),
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env }))),
      ),
    };
  };

  it("reads SENDGRID_API_KEY and SENDGRID_BASE_URL through effect/Config", async () => {
    const { layer, requests } = configured({
      SENDGRID_API_KEY: "sg_from_env",
      SENDGRID_BASE_URL: "https://stub.local",
    });
    await Effect.runPromise(send(message("recipient@example.com")).pipe(Effect.provide(layer)));
    expect(requests[0].url).toBe("https://stub.local/v3/mail/send");
    expect(requests[0].headers.authorization).toBe("Bearer sg_from_env");
  });

  // rc.118: `ConfigProvider.fromEnv` treats an empty variable as missing.
  it("falls back to the default base URL when SENDGRID_BASE_URL is empty", async () => {
    const { layer, requests } = configured({
      SENDGRID_API_KEY: "sg_from_env",
      SENDGRID_BASE_URL: "",
    });
    await Effect.runPromise(send(message("recipient@example.com")).pipe(Effect.provide(layer)));
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/mail/send");
  });

  // An empty variable reads as missing, so an empty and an unset key both
  // build and fail at call time, as `layer({ apiKey: "" })` does.
  it.each([
    ["empty", { SENDGRID_API_KEY: "" }],
    ["unset", {}],
  ])("builds when SENDGRID_API_KEY is %s, and fails at send time", async (_, env) => {
    const { layer, requests } = configured(env);
    const error = await Effect.runPromise(
      Effect.flip(send(message("recipient@example.com"))).pipe(Effect.provide(layer)),
    );
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error.provider).toBe("sendgrid");
    expect(error.cause).toBeInstanceOf(InvalidApiKeyError);
    expect(requests).toHaveLength(0);
  });

  it("still fails at layer construction when the source fails to read SENDGRID_API_KEY", async () => {
    const stub = stubHttp(accepted);
    // Only the key's read fails; every other path reads as absent.
    const failing = ConfigProvider.make((path) =>
      path[0] === "SENDGRID_API_KEY"
        ? Effect.fail(new ConfigProvider.SourceError({ message: "vault unreachable" }))
        : Effect.succeed(undefined),
    );
    const error = await Effect.runPromise(
      Effect.flip(
        Layer.build(
          layerConfig.pipe(Layer.provide(stub.layer), Layer.provide(ConfigProvider.layer(failing))),
        ).pipe(Effect.scoped),
      ),
    );
    expect(error._tag).toBe("ConfigError");
    expect(error.message).toContain("vault unreachable");
    expect(stub.requests).toHaveLength(0);
  });
});

describe("EmailService.send", () => {
  it("POSTs the mail-send payload with a bearer credential and answers the message id", async () => {
    const { layer, requests } = provider(accepted);
    const result = await Effect.runPromise(
      Effect.flatMap(EmailService, (email) => email.send(message("recipient@example.com"))).pipe(
        Effect.provide(layer),
      ),
    );
    expect(result.id).toStrictEqual(Option.some("msg-123"));
    expect(requests).toHaveLength(1);
    const [sent] = requests;
    expect(sent.method).toBe("POST");
    expect(sent.url).toBe("https://api.sendgrid.com/v3/mail/send");
    expect(sent.headers.authorization).toBe(`Bearer ${API_KEY}`);
    expect(sent.body).toEqual({
      personalizations: [{ to: [{ email: "recipient@example.com" }] }],
      from: { email: "sender@example.com" },
      subject: "Test Email",
      content: [{ type: "text/plain", value: "This is a test email" }],
    });
  });

  it("answers `none` for the id when SendGrid sends no X-Message-Id header", async () => {
    const { layer } = provider({ status: 202 });
    const result = await Effect.runPromise(
      Effect.flatMap(EmailService, (email) => email.send(message("recipient@example.com"))).pipe(
        Effect.provide(layer),
      ),
    );
    expect(result.id).toStrictEqual(Option.none());
  });

  it("sends HTML content after the text part", async () => {
    const { layer, requests } = provider(accepted);
    await Effect.runPromise(
      Effect.flatMap(EmailService, (email) =>
        email.send({ ...message("recipient@example.com"), html: "<p>This is a test email</p>" }),
      ).pipe(Effect.provide(layer)),
    );
    expect(contentOf(requests[0])).toEqual([
      { type: "text/plain", value: "This is a test email" },
      { type: "text/html", value: "<p>This is a test email</p>" },
    ]);
  });

  it("fails with EmailSendError carrying the status and a truncated body when SendGrid rejects", async () => {
    const { layer } = provider({
      status: 400,
      body: { errors: [{ message: "x".repeat(5_000), field: "from" }] },
    });
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.flatMap(EmailService, (email) => email.send(message("recipient@example.com"))),
      ).pipe(Effect.provide(layer)),
    );
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error.status).toStrictEqual(Option.some(400));
    expect(error.message).toContain("400");
    expect(error.message.length).toBeLessThan(UPSTREAM_BODY_LIMIT + 100);
    expect(error.message).not.toContain(API_KEY);
  });

  it("fails with EmailSendError on a 3xx, rather than reporting the message as sent", async () => {
    const { layer } = provider({
      status: 302,
      headers: { location: "https://elsewhere.example.test/v3/mail/send", "x-message-id": "m" },
    });
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.flatMap(EmailService, (email) => email.send(message("recipient@example.com"))),
      ).pipe(Effect.provide(layer)),
    );
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error.provider).toBe("sendgrid");
    expect(error.status).toStrictEqual(Option.some(302));
  });

  it("fails with EmailSendError and no status when the network is down", async () => {
    const layer_ = layer({ apiKey: Redacted.make(API_KEY) }).pipe(
      Layer.provide(unreachableHttp("SendGrid API error")),
    );
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.flatMap(EmailService, (email) => email.send(message("recipient@example.com"))),
      ).pipe(Effect.provide(layer_)),
    );
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error.status).toStrictEqual(Option.none());
    expect(error.message).toContain("SendGrid API error");
  });
});

describe("EmailService.sendBatch", () => {
  it("sends one request per message and answers one result per message, in order", async () => {
    let counter = 0;
    const { layer, requests } = provider(() => ({
      status: 202,
      headers: { "x-message-id": `msg-${++counter}` },
    }));
    const results = await Effect.runPromise(
      Effect.flatMap(EmailService, (email) =>
        email.sendBatch([
          message("recipient1@example.com", "Test Email 1"),
          message("recipient2@example.com", "Test Email 2"),
        ]),
      ).pipe(Effect.provide(layer)),
    );
    expect(requests).toHaveLength(2);
    expect(results.map((result) => Option.isSome(result.id))).toEqual([true, true]);
    expect(Arr.sort(requests.map(subjectOf), Order.String)).toEqual([
      "Test Email 1",
      "Test Email 2",
    ]);
  });

  it("fails the batch when a send fails", async () => {
    const { layer } = provider({ status: 500, body: { errors: [{ message: "boom" }] } });
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(EmailService, (email) =>
        email.sendBatch([message("recipient1@example.com")]),
      ).pipe(Effect.provide(layer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe("batched send", () => {
  it("sends one message through the resolver", async () => {
    const { layer, requests } = provider(accepted);
    const result = await Effect.runPromise(
      send(message("recipient@example.com")).pipe(Effect.provide(layer)),
    );
    expect(result.id).toStrictEqual(Option.some("msg-123"));
    expect(requests).toHaveLength(1);
  });

  it("collapses concurrent sends into one sendBatch call on the service", async () => {
    const batches: Array<number> = [];
    const counting = Layer.succeed(EmailService, {
      send: () => Effect.succeed({ id: Option.some("single") }),
      sendBatch: (messages) =>
        Effect.sync(() => {
          batches.push(messages.length);
          return messages.map((_, index) => ({ id: Option.some(`batched-${index + 1}`) }));
        }),
    });
    const results = await Effect.runPromise(
      Effect.all(
        [send(message("recipient1@example.com")), send(message("recipient2@example.com"))],
        { concurrency: "unbounded" },
      ).pipe(Effect.provide(counting)),
    );
    expect(batches).toEqual([2]);
    expect(results.map((result) => result.id)).toStrictEqual([
      Option.some("batched-1"),
      Option.some("batched-2"),
    ]);
  });

  it("sendMany batches every message and keeps their order", async () => {
    const batches: Array<number> = [];
    const counting = Layer.succeed(EmailService, {
      send: () => Effect.succeed({ id: Option.none() }),
      sendBatch: (messages) =>
        Effect.sync(() => {
          batches.push(messages.length);
          return messages.map((entry) => ({ id: Option.some(entry.to[0].email) }));
        }),
    });
    const results = await Effect.runPromise(
      sendMany([message("a@example.com"), message("b@example.com"), message("c@example.com")]).pipe(
        Effect.provide(counting),
      ),
    );
    expect(batches).toEqual([3]);
    expect(results.map((result) => result.id)).toStrictEqual([
      Option.some("a@example.com"),
      Option.some("b@example.com"),
      Option.some("c@example.com"),
    ]);
  });

  it("fails every request in a batch with the batch's failure", async () => {
    const failing = Layer.succeed(EmailService, {
      send: () => Effect.succeed({ id: Option.none() }),
      sendBatch: () =>
        Effect.fail(
          new EmailSendError({ provider: "test", message: "batch down", status: Option.none() }),
        ),
    });
    const exits = await Effect.runPromise(
      Effect.all(
        [Effect.exit(send(message("a@example.com"))), Effect.exit(send(message("b@example.com")))],
        { concurrency: "unbounded" },
      ).pipe(Effect.provide(failing)),
    );
    expect(exits.every(Exit.isFailure)).toBe(true);
  });

  it("through the real provider, two batched sends are two mail-send requests", async () => {
    const { layer, requests } = provider(accepted);
    await Effect.runPromise(
      Effect.all(
        [send(message("recipient1@example.com")), send(message("recipient2@example.com"))],
        { concurrency: "unbounded" },
      ).pipe(Effect.provide(layer)),
    );
    expect(requests).toHaveLength(2);
    expect(requests.every((sent) => sent.url === "https://api.sendgrid.com/v3/mail/send")).toBe(
      true,
    );
  });
});

describe("toMailSendPayload", () => {
  it("maps the whole envelope: cc, bcc, replyTo, attachments, headers and tags", () => {
    const payload = toMailSendPayload({
      from: { email: "sender@example.com", name: "Sender" },
      to: [{ email: "a@example.com", name: "A" }],
      cc: [{ email: "b@example.com" }],
      bcc: [{ email: "c@example.com" }],
      replyTo: { email: "reply@example.com" },
      subject: "s",
      text: "t",
      html: "<p>h</p>",
      attachments: [{ filename: "a.txt", content: "YQ==", contentType: "text/plain" }],
      headers: { "X-Entity-Ref-ID": "abc" },
      tags: ["welcome", "onboarding"],
    });
    expect(payload).toEqual({
      personalizations: [
        {
          to: [{ email: "a@example.com", name: "A" }],
          cc: [{ email: "b@example.com" }],
          bcc: [{ email: "c@example.com" }],
        },
      ],
      from: { email: "sender@example.com", name: "Sender" },
      reply_to: { email: "reply@example.com" },
      subject: "s",
      content: [
        { type: "text/plain", value: "t" },
        { type: "text/html", value: "<p>h</p>" },
      ],
      attachments: [
        { content: "YQ==", filename: "a.txt", type: "text/plain", disposition: "attachment" },
      ],
      headers: { "X-Entity-Ref-ID": "abc" },
      categories: ["welcome", "onboarding"],
    });
  });

  it("omits content when the message has neither text nor html (a template send)", () => {
    const payload = toMailSendPayload({
      from: { email: "sender@example.com" },
      to: [{ email: "a@example.com" }],
      subject: "s",
    });
    expect(payload.content).toBeUndefined();
    // The absent members are `undefined` on the value and gone from the wire.
    expect(decodeJson(encodePayload(payload))).toEqual({
      personalizations: [{ to: [{ email: "a@example.com" }] }],
      from: { email: "sender@example.com" },
      subject: "s",
    });
  });
});

/** The client alone (no mail sender), over a stub that answers `reply`. */
const client = (reply: Reply, apiKey = API_KEY) => {
  const stub = stubHttp(reply);
  return {
    requests: stub.requests,
    layer: layer({ apiKey: Redacted.make(apiKey) }).pipe(Layer.provide(stub.layer)),
  };
};

const runClient = <A, E>(
  effect: Effect.Effect<A, E, SendGridClient>,
  layer_: Layer.Layer<SendGridClient | EmailService>,
) => Effect.runPromise(effect.pipe(Effect.provide(layer_)));

describe("SendGridClient", () => {
  it("fails with InvalidApiKeyError when the key is empty, before any request", async () => {
    const { layer, requests } = client({ status: 200, body: {} }, "");
    const error = await runClient(
      Effect.flip(request({ url: "/v3/user/profile", method: "GET" })),
      layer,
    );
    expect(error).toBeInstanceOf(InvalidApiKeyError);
    expect(requests).toHaveLength(0);
  });

  it("makes a GET request and answers the parsed body", async () => {
    const body = { username: "test-user", email: "test@example.com" };
    const { layer, requests } = client({ status: 200, body });
    const result = await runClient(request({ url: "/v3/user/profile", method: "GET" }), layer);
    expect(result.status).toBe(200);
    expect(result.body).toEqual(body);
    expect(result.headers["content-type"]).toBe("application/json");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/user/profile");
    expect(requests[0].headers.authorization).toBe(`Bearer ${API_KEY}`);
  });

  it("makes a POST request with a JSON body", async () => {
    const { layer, requests } = client({ status: 201, body: { id: "123", name: "New Item" } });
    const clientRequest: ClientRequest = {
      url: "/v3/marketing/contacts",
      method: "POST",
      body: { email: "test@example.com", first_name: "Test" },
    };
    const result = await runClient(request(clientRequest), layer);
    expect(result.status).toBe(201);
    expect(result.body).toEqual({ id: "123", name: "New Item" });
    expect(requests[0].body).toEqual({ email: "test@example.com", first_name: "Test" });
    expect(requests[0].headers["content-type"]).toContain("application/json");
  });

  it("encodes query parameters into the URL", async () => {
    const { layer, requests } = client({ status: 200, body: { results: [] } });
    await runClient(
      request({
        url: "/v3/templates",
        method: "GET",
        qs: { page_size: 10, generations: "dynamic" },
      }),
      layer,
    );
    expect(requests[0].query).toEqual({ page_size: "10", generations: "dynamic" });
    expect(requests[0].url).toBe(
      "https://api.sendgrid.com/v3/templates?page_size=10&generations=dynamic",
    );
  });

  it("sends custom headers", async () => {
    const { layer, requests } = client({ status: 200, body: {} });
    await runClient(
      request({
        url: "/v3/user/profile",
        method: "GET",
        headers: { "X-Custom-Header": "custom-value" },
      }),
      layer,
    );
    expect(requests[0].headers["x-custom-header"]).toBe("custom-value");
  });

  it("honours a baseUrl override, keeping its path prefix", async () => {
    const stub = stubHttp({ status: 200, body: {} });
    const at = (baseUrl: string) =>
      layer({ apiKey: Redacted.make(API_KEY), baseUrl }).pipe(Layer.provide(stub.layer));
    await runClient(
      request({ url: "/v3/user/profile", method: "GET" }),
      at("https://api.eu.sendgrid.com"),
    );
    await runClient(
      request({ url: "/v3/user/profile", method: "GET" }),
      at("http://stub.test/sendgrid"),
    );
    expect(stub.requests.map((sent) => sent.url)).toEqual([
      "https://api.eu.sendgrid.com/v3/user/profile",
      "http://stub.test/sendgrid/v3/user/profile",
    ]);
  });

  // The host comes from `baseUrl` alone, so input that reaches `url` can
  // never send the bearer token elsewhere. A bare segment is refused too:
  // joined onto the base it would become part of the host.
  const foreignUrls = [
    ["an absolute https URL", "https://example.test/absolute"],
    ["an absolute URL in upper case", "HTTP://example.test/absolute"],
    ["a protocol-relative URL", "//example.test/absolute"],
    ["a slash-backslash URL", "/\\example.test/absolute"],
    ["a backslash URL", "\\\\example.test/absolute"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/plain,example.test"],
    ["a URL behind whitespace", " https://example.test/absolute"],
    ["a segment that joins into userinfo", "@example.test/absolute"],
    ["a segment that joins into the host", ".example.test/absolute"],
    ["a path without its leading slash", "v3/templates"],
    ["an empty url", ""],
  ] as const;

  // The url is checked before the key, so a keyless stage refuses it the same way.
  it.each(
    Arr.flatMap(foreignUrls, ([name, url]) => [
      [name, "a key", url, API_KEY],
      [name, "an empty key", url, ""],
    ]),
  )("refuses %s with %s, before any request", async (_name, _keyName, url, apiKey) => {
    const { layer, requests } = client({ status: 200, body: {} }, apiKey);
    const error = asClientError(
      await runClient(Effect.flip(request({ url, method: "GET" })), layer),
    );
    expect(error.status).toStrictEqual(Option.none());
    expect(error.message).toContain("must be a path");
    expect(error.message).not.toContain("example.test");
    expect(error.message).not.toContain(API_KEY);
    expect(requests).toHaveLength(0);
  });

  it("keeps a path that only looks like another host on the configured host", async () => {
    const { layer, requests } = client({ status: 200, body: {} });
    await runClient(
      Effect.forEach(
        ["/%2F%2Fexample.test/x", "/@example.test/x", "/.example.test/x"],
        (url) => request({ url, method: "GET" }),
        { concurrency: 1 },
      ),
      layer,
    );
    expect(requests.map((sent) => new URL(sent.url).origin)).toEqual([
      "https://api.sendgrid.com",
      "https://api.sendgrid.com",
      "https://api.sendgrid.com",
    ]);
  });

  it("fails before any request when the baseUrl is not an absolute URL", async () => {
    const stub = stubHttp({ status: 200, body: {} });
    const layer_ = layer({ apiKey: Redacted.make(API_KEY), baseUrl: "api.sendgrid.com" }).pipe(
      Layer.provide(stub.layer),
    );
    const error = asClientError(
      await runClient(Effect.flip(request({ url: "/v3/user/profile", method: "GET" })), layer_),
    );
    expect(error.status).toStrictEqual(Option.none());
    expect(error.message).toContain("base URL");
    expect(stub.requests).toHaveLength(0);
  });

  it("fails with SendGridClientError and no status when the transport fails", async () => {
    const layer_ = layer({ apiKey: Redacted.make(API_KEY) }).pipe(
      Layer.provide(unreachableHttp("API request failed")),
    );
    const error = asClientError(
      await runClient(Effect.flip(request({ url: "/v3/user/profile", method: "GET" })), layer_),
    );
    expect(error.status).toStrictEqual(Option.none());
    expect(error.message).toContain("API request failed");
  });

  it("extracts the status code from an error response", async () => {
    const { layer } = client({
      status: 401,
      body: { errors: [{ message: "Unauthorized" }] },
    });
    const error = asClientError(
      await runClient(Effect.flip(request({ url: "/v3/user/profile", method: "GET" })), layer),
    );
    expect(error.status).toStrictEqual(Option.some(401));
    expect(error.message).toContain("401");
    expect(error.message).toContain("Unauthorized");
  });

  it("truncates an error body before it reaches the message", async () => {
    const { layer } = client({ status: 500, body: { errors: [{ message: "x".repeat(5_000) }] } });
    const error = await runClient(
      Effect.flip(request({ url: "/v3/user/profile", method: "GET" })),
      layer,
    );
    expect(error.message.length).toBeLessThan(UPSTREAM_BODY_LIMIT + 100);
  });

  it("fails on a 3xx with the status, rather than returning it as a response", async () => {
    const { layer } = client({
      status: 302,
      body: { moved: "x".repeat(5_000) },
      headers: { location: "https://elsewhere.example.test/v3/user/profile" },
    });
    const error = asClientError(
      await runClient(Effect.flip(request({ url: "/v3/user/profile", method: "GET" })), layer),
    );
    expect(error.status).toStrictEqual(Option.some(302));
    expect(error.message).toContain("302");
    expect(error.message.length).toBeLessThan(UPSTREAM_BODY_LIMIT + 100);
    expect(error.message).not.toContain(API_KEY);
  });

  it("handles PUT requests", async () => {
    const { layer, requests } = client({ status: 200, body: { updated: true } });
    const result = await runClient(
      request({
        url: "/v3/templates/template-id",
        method: "PUT",
        body: { name: "Updated Template" },
      }),
      layer,
    );
    expect(result.status).toBe(200);
    expect(requests[0].method).toBe("PUT");
  });

  it("handles DELETE requests with an empty 204 body", async () => {
    const { layer, requests } = client({ status: 204 });
    const result = await runClient(
      request({ url: "/v3/templates/template-id", method: "DELETE" }),
      layer,
    );
    expect(result.status).toBe(204);
    expect(result.body).toBeUndefined();
    expect(requests[0].method).toBe("DELETE");
  });
});

/** The client over a stub `fetch` under the real `FetchHttpClient`. */
const fetchClient = (respond: Parameters<typeof stubFetch>[0]) => {
  const stub = stubFetch(respond);
  return {
    calls: stub.calls,
    layer: layer({ apiKey: Redacted.make(API_KEY) }).pipe(Layer.provide(stub.layer)),
  };
};

describe("SendGridClient over fetch", () => {
  it("refuses to follow redirects, so a 3xx can never carry the bearer token elsewhere", async () => {
    const { layer, calls } = fetchClient(() => new Response(null, { status: 204 }));
    await runClient(request({ url: "/v3/templates/template-id", method: "DELETE" }), layer);
    expect(calls).toHaveLength(1);
    expect(calls[0].init.redirect).toBe("error");
  });

  it("layers the redirect refusal over the consumer's own RequestInit defaults", async () => {
    const { layer, calls } = fetchClient(() => new Response(null, { status: 204 }));
    await runClient(
      request({ url: "/v3/templates/template-id", method: "DELETE" }).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, {
          credentials: "omit",
          redirect: "follow",
        }),
      ),
      layer,
    );
    expect(calls[0].init.redirect).toBe("error");
    expect(calls[0].init.credentials).toBe("omit");
  });

  it("surfaces a redirect the fetch refused as a transport SendGridClientError with no status", async () => {
    // What fetch does under `redirect: "error"`: reject rather than answer.
    // Under the default `follow` the stub answers the 3xx instead.
    const { layer, calls } = fetchClient(({ init }) =>
      init.redirect === "error"
        ? Promise.reject(new TypeError("unexpected redirect"))
        : new Response(null, {
            status: 302,
            headers: { location: "https://elsewhere.example.test/v3/user/profile" },
          }),
    );
    const error = asClientError(
      await runClient(Effect.flip(request({ url: "/v3/user/profile", method: "GET" })), layer),
    );
    expect(calls).toHaveLength(1);
    expect(error.status).toStrictEqual(Option.none());
    expect(error.message).toContain("unexpected redirect");
    expect(error.message).not.toContain(API_KEY);
  });

  it("still fails with the status when the error body cannot be read", async () => {
    const { layer } = fetchClient(
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
    const error = asClientError(
      await runClient(Effect.flip(request({ url: "/v3/user/profile", method: "GET" })), layer),
    );
    expect(error.status).toStrictEqual(Option.some(500));
    expect(error.message).toContain("500");
  });
});

describe("Template", () => {
  it("lists templates", async () => {
    const { layer, requests } = client({
      status: 200,
      body: { result: [{ id: "template-1", name: "Test Template", generation: "dynamic" }] },
    });
    const result = await runClient(Template.list({ generations: "dynamic", page_size: 10 }), layer);
    expect(result.status).toBe(200);
    expect(result.body.result).toHaveLength(1);
    expect(result.body.result[0].generation).toBe("dynamic");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe(
      "https://api.sendgrid.com/v3/templates?generations=dynamic&page_size=10",
    );
  });

  it("gets a template by id", async () => {
    const { layer, requests } = client({
      status: 200,
      body: { id: "template-1", name: "Test Template", generation: "dynamic" },
    });
    const result = await runClient(Template.get("template-1"), layer);
    expect(result.body.id).toBe("template-1");
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/templates/template-1");
    expect(requests[0].method).toBe("GET");
  });

  it("creates a template", async () => {
    const { layer, requests } = client({
      status: 201,
      body: { id: "template-1", name: "New Template", generation: "dynamic" },
    });
    const result = await runClient(
      Template.create({ name: "New Template", generation: "dynamic" }),
      layer,
    );
    expect(result.status).toBe(201);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/templates");
    expect(requests[0].body).toEqual({ name: "New Template", generation: "dynamic" });
  });

  it("updates a template", async () => {
    const { layer, requests } = client({
      status: 200,
      body: { id: "template-1", name: "Updated Template", generation: "dynamic" },
    });
    const result = await runClient(
      Template.update("template-1", { name: "Updated Template" }),
      layer,
    );
    expect(result.body.name).toBe("Updated Template");
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/templates/template-1");
    expect(requests[0].body).toEqual({ name: "Updated Template" });
  });

  it("deletes a template", async () => {
    const { layer, requests } = client({ status: 204 });
    const result = await runClient(Template.remove("template-1"), layer);
    expect(result.status).toBe(204);
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/templates/template-1");
  });

  it("fails with SendGridClientError when the body does not match the resource", async () => {
    const { layer } = client({ status: 200, body: { result: "not-a-list" } });
    const error = asClientError(await runClient(Effect.flip(Template.list()), layer));
    expect(error.status).toStrictEqual(Option.some(200));
    expect(error.message).toContain("expected shape");
  });
});

describe("Contact", () => {
  it("upserts contacts", async () => {
    const { layer, requests } = client({ status: 202, body: { job_id: "job-123" } });
    const result = await runClient(
      Contact.upsert([{ email: "test@example.com", first_name: "Test", last_name: "User" }]),
      layer,
    );
    expect(result.status).toBe(202);
    expect(result.body.job_id).toBe("job-123");
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/contacts");
    expect(requests[0].body).toEqual({
      contacts: [{ email: "test@example.com", first_name: "Test", last_name: "User" }],
    });
  });

  it("searches contacts", async () => {
    const { layer, requests } = client({
      status: 200,
      body: { result: [{ email: "test@example.com" }], contact_count: 1 },
    });
    const result = await runClient(Contact.search({ query: "test@example.com" }), layer);
    expect(result.body.contact_count).toBe(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/contacts/search");
    expect(requests[0].body).toEqual({ query: "test@example.com" });
  });

  it("gets a contact by id", async () => {
    const { layer, requests } = client({
      status: 200,
      body: { id: "contact-1", email: "test@example.com" },
    });
    const result = await runClient(Contact.get("contact-1"), layer);
    expect(result.body.id).toBe("contact-1");
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/contacts/contact-1");
  });

  it("deletes contacts by comma-separated ids", async () => {
    const { layer, requests } = client({ status: 202, body: { job_id: "job-123" } });
    const result = await runClient(Contact.remove(["contact-1", "contact-2"]), layer);
    expect(result.body.job_id).toBe("job-123");
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].query).toEqual({ ids: "contact-1,contact-2" });
  });
});

describe("ApiKey", () => {
  it("lists API keys", async () => {
    const { layer, requests } = client({
      status: 200,
      body: { result: [{ api_key_id: "key-1", name: "Test Key" }] },
    });
    const result = await runClient(ApiKey.list({ limit: 10 }), layer);
    expect(result.body.result).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/api_keys?limit=10");
  });

  it("gets an API key by id", async () => {
    const { layer } = client({ status: 200, body: { api_key_id: "key-1", name: "Test Key" } });
    const result = await runClient(ApiKey.get("key-1"), layer);
    expect(result.body.api_key_id).toBe("key-1");
  });

  it("creates an API key", async () => {
    const { layer, requests } = client({
      status: 201,
      body: { api_key_id: "key-1", name: "New Key", api_key: "SG.xxx" },
    });
    const result = await runClient(
      ApiKey.create({ name: "New Key", scopes: ["mail.send"] }),
      layer,
    );
    expect(result.status).toBe(201);
    expect(result.body.api_key).toBe("SG.xxx");
    expect(requests[0].body).toEqual({ name: "New Key", scopes: ["mail.send"] });
  });

  it("updates an API key", async () => {
    const { layer, requests } = client({
      status: 200,
      body: { api_key_id: "key-1", name: "Updated Key" },
    });
    const result = await runClient(ApiKey.update("key-1", "Updated Key"), layer);
    expect(result.body.name).toBe("Updated Key");
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].body).toEqual({ name: "Updated Key" });
  });

  it("deletes an API key", async () => {
    const { layer, requests } = client({ status: 204 });
    const result = await runClient(ApiKey.remove("key-1"), layer);
    expect(result.status).toBe(204);
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/api_keys/key-1");
  });
});

describe("UserProfile", () => {
  it("gets the user profile", async () => {
    const { layer, requests } = client({
      status: 200,
      body: { username: "testuser", email: "test@example.com" },
    });
    const result = await runClient(UserProfile.get(), layer);
    expect(result.body.username).toBe("testuser");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/user/profile");
  });

  it("updates the user profile", async () => {
    const { layer, requests } = client({
      status: 200,
      body: { username: "testuser", email: "updated@example.com" },
    });
    const result = await runClient(UserProfile.update({ email: "updated@example.com" }), layer);
    expect(result.body.email).toBe("updated@example.com");
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].body).toEqual({ email: "updated@example.com" });
  });
});
