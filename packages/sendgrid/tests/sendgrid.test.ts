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

import { describe, expect, it } from "@effect/vitest";
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
} from "@thomasfosterau/effect-connect";
import {
  ApiKey,
  Contact,
  InvalidApiKeyError,
  layer as sendGridLayer,
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
  StubFailure,
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
  Schema.decodeUnknownSync(Schema.Struct({ subject: Schema.String }))(
    Option.getOrUndefined(sent.body),
  ).subject;

/** The `content` parts of a captured mail-send body. */
const contentOf = (sent: RecordedRequest) =>
  Schema.decodeUnknownSync(Schema.Struct({ content: Schema.Json }))(
    Option.getOrUndefined(sent.body),
  ).content;

/** Narrows a client failure to the `SendGridClientError` case, failing the test otherwise. */
const asClientError = (
  error: SendGridClientError | InvalidApiKeyError,
): Effect.Effect<SendGridClientError> =>
  Schema.is(SendGridClientError)(error)
    ? Effect.succeed(error)
    : Effect.die(`expected a SendGridClientError, got ${error._tag}`);

/** The provider over a stub that answers `reply`, with the given key. */
const provider = (reply: Reply, apiKey = API_KEY) => {
  const stub = stubHttp(reply);
  return {
    requests: stub.requests,
    layer: sendGridLayer({ apiKey: Redacted.make(apiKey) }).pipe(Layer.provide(stub.layer)),
  };
};

const accepted: StubReply = { status: 202, headers: { "x-message-id": "msg-123" } };

describe("layer", () => {
  it.effect("builds the EmailService and the client with a valid API key", () =>
    Effect.gen(function* () {
      const { layer } = provider(accepted);
      const services = yield* Effect.all([EmailService, SendGridClient], { concurrency: 1 }).pipe(
        Effect.provide(layer),
      );
      expect(services).toHaveLength(2);
    }),
  );

  it.effect("builds with an empty API key, and fails at send time", () =>
    Effect.gen(function* () {
      const { layer, requests } = provider(accepted, "");
      const error = yield* Effect.flip(send(message("recipient@example.com"))).pipe(
        Effect.provide(layer),
      );
      expect(error).toBeInstanceOf(EmailSendError);
      expect(error.provider).toBe("sendgrid");
      expect(error.cause).toBeInstanceOf(InvalidApiKeyError);
      expect(error.message).toContain("API key");
      expect(requests).toHaveLength(0);
    }),
  );
});

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

describe("layerConfig", () => {
  it.effect("reads SENDGRID_API_KEY and SENDGRID_BASE_URL through effect/Config", () =>
    Effect.gen(function* () {
      const { layer, requests } = configured({
        SENDGRID_API_KEY: "sg_from_env",
        SENDGRID_BASE_URL: "https://stub.local",
      });
      yield* send(message("recipient@example.com")).pipe(Effect.provide(layer));
      expect(requests[0].url).toBe("https://stub.local/v3/mail/send");
      expect(requests[0].headers.authorization).toBe("Bearer sg_from_env");
    }),
  );

  // rc.118: `ConfigProvider.fromEnv` treats an empty variable as missing.
  it.effect("falls back to the default base URL when SENDGRID_BASE_URL is empty", () =>
    Effect.gen(function* () {
      const { layer, requests } = configured({
        SENDGRID_API_KEY: "sg_from_env",
        SENDGRID_BASE_URL: "",
      });
      yield* send(message("recipient@example.com")).pipe(Effect.provide(layer));
      expect(requests[0].url).toBe("https://api.sendgrid.com/v3/mail/send");
    }),
  );

  // An empty variable reads as missing, so an empty and an unset key both
  // build and fail at call time, as `layer({ apiKey: "" })` does.
  const keylessEnvs: ReadonlyArray<readonly [string, Record<string, string>]> = [
    ["empty", { SENDGRID_API_KEY: "" }],
    ["unset", {}],
  ];
  keylessEnvs.forEach(([name, env]) => {
    it.effect(`builds when SENDGRID_API_KEY is ${name}, and fails at send time`, () =>
      Effect.gen(function* () {
        const { layer, requests } = configured(env);
        const error = yield* Effect.flip(send(message("recipient@example.com"))).pipe(
          Effect.provide(layer),
        );
        expect(error).toBeInstanceOf(EmailSendError);
        expect(error.provider).toBe("sendgrid");
        expect(error.cause).toBeInstanceOf(InvalidApiKeyError);
        expect(requests).toHaveLength(0);
      }),
    );
  });

  it.effect(
    "still fails at layer construction when the source fails to read SENDGRID_API_KEY",
    () =>
      Effect.gen(function* () {
        const stub = stubHttp(accepted);
        // Only the key's read fails; every other path reads as absent.
        const failing = ConfigProvider.make((path) =>
          path[0] === "SENDGRID_API_KEY"
            ? Effect.fail(new ConfigProvider.SourceError({ message: "vault unreachable" }))
            : Effect.succeed(undefined),
        );
        const error = yield* Effect.flip(
          Layer.build(
            layerConfig.pipe(
              Layer.provide(stub.layer),
              Layer.provide(ConfigProvider.layer(failing)),
            ),
          ).pipe(Effect.scoped),
        );
        expect(error._tag).toBe("ConfigError");
        expect(error.message).toContain("vault unreachable");
        expect(stub.requests).toHaveLength(0);
      }),
  );
});

describe("EmailService.send", () => {
  it.effect("POSTs the mail-send payload with a bearer credential and answers the message id", () =>
    Effect.gen(function* () {
      const { layer, requests } = provider(accepted);
      const result = yield* Effect.flatMap(EmailService, (email) =>
        email.send(message("recipient@example.com")),
      ).pipe(Effect.provide(layer));
      expect(result.id).toStrictEqual(Option.some("msg-123"));
      expect(requests).toHaveLength(1);
      const [sent] = requests;
      expect(sent.method).toBe("POST");
      expect(sent.url).toBe("https://api.sendgrid.com/v3/mail/send");
      expect(sent.headers.authorization).toBe(`Bearer ${API_KEY}`);
      expect(sent.body).toEqual(
        Option.some({
          personalizations: [{ to: [{ email: "recipient@example.com" }] }],
          from: { email: "sender@example.com" },
          subject: "Test Email",
          content: [{ type: "text/plain", value: "This is a test email" }],
        }),
      );
    }),
  );

  it.effect("answers `none` for the id when SendGrid sends no X-Message-Id header", () =>
    Effect.gen(function* () {
      const { layer } = provider({ status: 202 });
      const result = yield* Effect.flatMap(EmailService, (email) =>
        email.send(message("recipient@example.com")),
      ).pipe(Effect.provide(layer));
      expect(result.id).toStrictEqual(Option.none());
    }),
  );

  it.effect("sends HTML content after the text part", () =>
    Effect.gen(function* () {
      const { layer, requests } = provider(accepted);
      yield* Effect.flatMap(EmailService, (email) =>
        email.send({ ...message("recipient@example.com"), html: "<p>This is a test email</p>" }),
      ).pipe(Effect.provide(layer));
      expect(contentOf(requests[0])).toEqual([
        { type: "text/plain", value: "This is a test email" },
        { type: "text/html", value: "<p>This is a test email</p>" },
      ]);
    }),
  );

  it.effect(
    "fails with EmailSendError carrying the status and a truncated body when SendGrid rejects",
    () =>
      Effect.gen(function* () {
        const { layer } = provider({
          status: 400,
          body: { errors: [{ message: "x".repeat(5_000), field: "from" }] },
        });
        const error = yield* Effect.flip(
          Effect.flatMap(EmailService, (email) => email.send(message("recipient@example.com"))),
        ).pipe(Effect.provide(layer));
        expect(error).toBeInstanceOf(EmailSendError);
        expect(error.status).toStrictEqual(Option.some(400));
        expect(error.message).toContain("400");
        expect(error.message.length).toBeLessThan(UPSTREAM_BODY_LIMIT + 100);
        expect(error.message).not.toContain(API_KEY);
      }),
  );

  it.effect("fails with EmailSendError on a 3xx, rather than reporting the message as sent", () =>
    Effect.gen(function* () {
      const { layer } = provider({
        status: 302,
        headers: { location: "https://elsewhere.example.test/v3/mail/send", "x-message-id": "m" },
      });
      const error = yield* Effect.flip(
        Effect.flatMap(EmailService, (email) => email.send(message("recipient@example.com"))),
      ).pipe(Effect.provide(layer));
      expect(error).toBeInstanceOf(EmailSendError);
      expect(error.provider).toBe("sendgrid");
      expect(error.status).toStrictEqual(Option.some(302));
    }),
  );

  it.effect("fails with EmailSendError and no status when the network is down", () =>
    Effect.gen(function* () {
      const layer = sendGridLayer({ apiKey: Redacted.make(API_KEY) }).pipe(
        Layer.provide(unreachableHttp("SendGrid API error")),
      );
      const error = yield* Effect.flip(
        Effect.flatMap(EmailService, (email) => email.send(message("recipient@example.com"))),
      ).pipe(Effect.provide(layer));
      expect(error).toBeInstanceOf(EmailSendError);
      expect(error.status).toStrictEqual(Option.none());
      expect(error.message).toContain("SendGrid API error");
    }),
  );
});

describe("EmailService.sendBatch", () => {
  it.effect("sends one request per message and answers one result per message, in order", () =>
    Effect.gen(function* () {
      let counter = 0;
      const { layer, requests } = provider(() => ({
        status: 202,
        headers: { "x-message-id": `msg-${++counter}` },
      }));
      const results = yield* Effect.flatMap(EmailService, (email) =>
        email.sendBatch([
          message("recipient1@example.com", "Test Email 1"),
          message("recipient2@example.com", "Test Email 2"),
        ]),
      ).pipe(Effect.provide(layer));
      expect(requests).toHaveLength(2);
      expect(results.map((result) => Option.isSome(result.id))).toEqual([true, true]);
      expect(Arr.sort(requests.map(subjectOf), Order.String)).toEqual([
        "Test Email 1",
        "Test Email 2",
      ]);
    }),
  );

  it.effect("fails the batch when a send fails", () =>
    Effect.gen(function* () {
      const { layer } = provider({ status: 500, body: { errors: [{ message: "boom" }] } });
      const exit = yield* Effect.exit(
        Effect.flatMap(EmailService, (email) =>
          email.sendBatch([message("recipient1@example.com")]),
        ).pipe(Effect.provide(layer)),
      );
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );
});

describe("batched send", () => {
  it.effect("sends one message through the resolver", () =>
    Effect.gen(function* () {
      const { layer, requests } = provider(accepted);
      const result = yield* send(message("recipient@example.com")).pipe(Effect.provide(layer));
      expect(result.id).toStrictEqual(Option.some("msg-123"));
      expect(requests).toHaveLength(1);
    }),
  );

  it.effect("collapses concurrent sends into one sendBatch call on the service", () =>
    Effect.gen(function* () {
      const batches: Array<number> = [];
      const counting = Layer.succeed(EmailService, {
        send: () => Effect.succeed({ id: Option.some("single") }),
        sendBatch: (messages) =>
          Effect.sync(() => {
            batches.push(messages.length);
            return messages.map((_, index) => ({ id: Option.some(`batched-${index + 1}`) }));
          }),
      });
      const results = yield* Effect.all(
        [send(message("recipient1@example.com")), send(message("recipient2@example.com"))],
        { concurrency: "unbounded" },
      ).pipe(Effect.provide(counting));
      expect(batches).toEqual([2]);
      expect(results.map((result) => result.id)).toStrictEqual([
        Option.some("batched-1"),
        Option.some("batched-2"),
      ]);
    }),
  );

  it.effect("sendMany batches every message and keeps their order", () =>
    Effect.gen(function* () {
      const batches: Array<number> = [];
      const counting = Layer.succeed(EmailService, {
        send: () => Effect.succeed({ id: Option.none() }),
        sendBatch: (messages) =>
          Effect.sync(() => {
            batches.push(messages.length);
            return messages.map((entry) => ({ id: Option.some(entry.to[0].email) }));
          }),
      });
      const results = yield* sendMany([
        message("a@example.com"),
        message("b@example.com"),
        message("c@example.com"),
      ]).pipe(Effect.provide(counting));
      expect(batches).toEqual([3]);
      expect(results.map((result) => result.id)).toStrictEqual([
        Option.some("a@example.com"),
        Option.some("b@example.com"),
        Option.some("c@example.com"),
      ]);
    }),
  );

  it.effect("fails every request in a batch with the batch's failure", () =>
    Effect.gen(function* () {
      const failing = Layer.succeed(EmailService, {
        send: () => Effect.succeed({ id: Option.none() }),
        sendBatch: () =>
          Effect.fail(
            new EmailSendError({ provider: "test", message: "batch down", status: Option.none() }),
          ),
      });
      const exits = yield* Effect.all(
        [Effect.exit(send(message("a@example.com"))), Effect.exit(send(message("b@example.com")))],
        { concurrency: "unbounded" },
      ).pipe(Effect.provide(failing));
      expect(exits.every(Exit.isFailure)).toBe(true);
    }),
  );

  it.effect("through the real provider, two batched sends are two mail-send requests", () =>
    Effect.gen(function* () {
      const { layer, requests } = provider(accepted);
      yield* Effect.all(
        [send(message("recipient1@example.com")), send(message("recipient2@example.com"))],
        { concurrency: "unbounded" },
      ).pipe(Effect.provide(layer));
      expect(requests).toHaveLength(2);
      expect(requests.every((sent) => sent.url === "https://api.sendgrid.com/v3/mail/send")).toBe(
        true,
      );
    }),
  );
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
    layer: sendGridLayer({ apiKey: Redacted.make(apiKey) }).pipe(Layer.provide(stub.layer)),
  };
};

const runClient = <A, E>(
  effect: Effect.Effect<A, E, SendGridClient>,
  layer: Layer.Layer<SendGridClient | EmailService>,
) => effect.pipe(Effect.provide(layer));

describe("SendGridClient", () => {
  it.effect("fails with InvalidApiKeyError when the key is empty, before any request", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({ status: 200, body: {} }, "");
      const error = yield* runClient(
        Effect.flip(request({ url: "/v3/user/profile", method: "GET" })),
        layer,
      );
      expect(error).toBeInstanceOf(InvalidApiKeyError);
      expect(requests).toHaveLength(0);
    }),
  );

  it.effect("makes a GET request and answers the parsed body", () =>
    Effect.gen(function* () {
      const body = { username: "test-user", email: "test@example.com" };
      const { layer, requests } = client({ status: 200, body });
      const result = yield* runClient(request({ url: "/v3/user/profile", method: "GET" }), layer);
      expect(result.status).toBe(200);
      expect(result.body).toEqual(body);
      expect(result.headers["content-type"]).toBe("application/json");
      expect(requests[0].method).toBe("GET");
      expect(requests[0].url).toBe("https://api.sendgrid.com/v3/user/profile");
      expect(requests[0].headers.authorization).toBe(`Bearer ${API_KEY}`);
    }),
  );

  it.effect("makes a POST request with a JSON body", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({ status: 201, body: { id: "123", name: "New Item" } });
      const clientRequest: ClientRequest = {
        url: "/v3/marketing/contacts",
        method: "POST",
        body: { email: "test@example.com", first_name: "Test" },
      };
      const result = yield* runClient(request(clientRequest), layer);
      expect(result.status).toBe(201);
      expect(result.body).toEqual({ id: "123", name: "New Item" });
      expect(requests[0].body).toEqual(
        Option.some({
          email: "test@example.com",
          first_name: "Test",
        }),
      );
      expect(requests[0].headers["content-type"]).toContain("application/json");
    }),
  );

  it.effect("encodes query parameters into the URL", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({ status: 200, body: { results: [] } });
      yield* runClient(
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
    }),
  );

  it.effect("sends custom headers", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({ status: 200, body: {} });
      yield* runClient(
        request({
          url: "/v3/user/profile",
          method: "GET",
          headers: { "X-Custom-Header": "custom-value" },
        }),
        layer,
      );
      expect(requests[0].headers["x-custom-header"]).toBe("custom-value");
    }),
  );

  it.effect("honours a baseUrl override, keeping its path prefix", () =>
    Effect.gen(function* () {
      const stub = stubHttp({ status: 200, body: {} });
      const at = (baseUrl: string) =>
        sendGridLayer({ apiKey: Redacted.make(API_KEY), baseUrl }).pipe(Layer.provide(stub.layer));
      yield* runClient(
        request({ url: "/v3/user/profile", method: "GET" }),
        at("https://api.eu.sendgrid.com"),
      );
      yield* runClient(
        request({ url: "/v3/user/profile", method: "GET" }),
        at("http://stub.test/sendgrid"),
      );
      expect(stub.requests.map((sent) => sent.url)).toEqual([
        "https://api.eu.sendgrid.com/v3/user/profile",
        "http://stub.test/sendgrid/v3/user/profile",
      ]);
    }),
  );

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
  Arr.flatMap(foreignUrls, ([label, foreign]) => [
    { name: label, keyName: "a key", url: foreign, apiKey: API_KEY },
    { name: label, keyName: "an empty key", url: foreign, apiKey: "" },
  ]).forEach(({ name, keyName, url, apiKey }) => {
    it.effect(`refuses ${name} with ${keyName}, before any request`, () =>
      Effect.gen(function* () {
        const { layer, requests } = client({ status: 200, body: {} }, apiKey);
        const error = yield* asClientError(
          yield* runClient(Effect.flip(request({ url, method: "GET" })), layer),
        );
        expect(error.status).toStrictEqual(Option.none());
        expect(error.message).toContain("must be a path");
        expect(error.message).not.toContain("example.test");
        expect(error.message).not.toContain(API_KEY);
        expect(requests).toHaveLength(0);
      }),
    );
  });

  it.effect("keeps a path that only looks like another host on the configured host", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({ status: 200, body: {} });
      yield* runClient(
        Effect.forEach(
          [
            "/%2F%2Fexample.test/x",
            "/@example.test/x",
            "/.example.test/x",
            // URL parsers strip a tab or newline and resolve `..`, leaving an
            // empty first segment, which is still a path on this host.
            "/\t/example.test/x",
            "/\n/example.test/x",
            "/..//example.test/x",
          ],
          (url) => request({ url, method: "GET" }),
          { concurrency: 1 },
        ),
        layer,
      );
      expect(
        requests.map((sent) => {
          const { origin, pathname } = new URL(sent.url);
          return [origin, pathname];
        }),
      ).toEqual([
        ["https://api.sendgrid.com", "/%2F%2Fexample.test/x"],
        ["https://api.sendgrid.com", "/@example.test/x"],
        ["https://api.sendgrid.com", "/.example.test/x"],
        ["https://api.sendgrid.com", "//example.test/x"],
        ["https://api.sendgrid.com", "//example.test/x"],
        ["https://api.sendgrid.com", "//example.test/x"],
      ]);
    }),
  );

  // Only an http(s) base has an origin that pins a host: under any other
  // scheme every join shares the opaque origin "null", and `file:` +
  // "/\t/example.test/x" parses as `file://example.test/x`.
  Arr.flatMap(
    [
      ["a host without a scheme", "api.sendgrid.com"],
      ["a file: URL", "file:"],
      ["a URL with a non-http scheme", "foo:"],
    ] as const,
    ([label, base]) => [
      { name: label, baseUrl: base, url: "/v3/user/profile" },
      { name: label, baseUrl: base, url: "/\t/example.test/x" },
    ],
  ).forEach(({ name, baseUrl, url }) => {
    it.effect(
      `fails before any request when the baseUrl is ${name} (${baseUrl}, url ${encodePayload(url)})`,
      () =>
        Effect.gen(function* () {
          const stub = stubHttp({ status: 200, body: {} });
          const layer = sendGridLayer({ apiKey: Redacted.make(API_KEY), baseUrl }).pipe(
            Layer.provide(stub.layer),
          );
          const error = yield* asClientError(
            yield* runClient(Effect.flip(request({ url, method: "GET" })), layer),
          );
          expect(error.status).toStrictEqual(Option.none());
          expect(error.message).toContain("base URL is not an absolute http: or https: URL");
          expect(error.message).not.toContain(API_KEY);
          expect(stub.requests).toHaveLength(0);
        }),
    );
  });

  it.effect("fails with SendGridClientError and no status when the transport fails", () =>
    Effect.gen(function* () {
      const layer = sendGridLayer({ apiKey: Redacted.make(API_KEY) }).pipe(
        Layer.provide(unreachableHttp("API request failed")),
      );
      const error = yield* asClientError(
        yield* runClient(Effect.flip(request({ url: "/v3/user/profile", method: "GET" })), layer),
      );
      expect(error.status).toStrictEqual(Option.none());
      expect(error.message).toContain("API request failed");
    }),
  );

  it.effect("extracts the status code from an error response", () =>
    Effect.gen(function* () {
      const { layer } = client({
        status: 401,
        body: { errors: [{ message: "Unauthorized" }] },
      });
      const error = yield* asClientError(
        yield* runClient(Effect.flip(request({ url: "/v3/user/profile", method: "GET" })), layer),
      );
      expect(error.status).toStrictEqual(Option.some(401));
      expect(error.message).toContain("401");
      expect(error.message).toContain("Unauthorized");
    }),
  );

  it.effect("truncates an error body before it reaches the message", () =>
    Effect.gen(function* () {
      const { layer } = client({ status: 500, body: { errors: [{ message: "x".repeat(5_000) }] } });
      const error = yield* runClient(
        Effect.flip(request({ url: "/v3/user/profile", method: "GET" })),
        layer,
      );
      expect(error.message.length).toBeLessThan(UPSTREAM_BODY_LIMIT + 100);
    }),
  );

  it.effect("fails on a 3xx with the status, rather than returning it as a response", () =>
    Effect.gen(function* () {
      const { layer } = client({
        status: 302,
        body: { moved: "x".repeat(5_000) },
        headers: { location: "https://elsewhere.example.test/v3/user/profile" },
      });
      const error = yield* asClientError(
        yield* runClient(Effect.flip(request({ url: "/v3/user/profile", method: "GET" })), layer),
      );
      expect(error.status).toStrictEqual(Option.some(302));
      expect(error.message).toContain("302");
      expect(error.message.length).toBeLessThan(UPSTREAM_BODY_LIMIT + 100);
      expect(error.message).not.toContain(API_KEY);
    }),
  );

  it.effect("handles PUT requests", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({ status: 200, body: { updated: true } });
      const result = yield* runClient(
        request({
          url: "/v3/templates/template-id",
          method: "PUT",
          body: { name: "Updated Template" },
        }),
        layer,
      );
      expect(result.status).toBe(200);
      expect(requests[0].method).toBe("PUT");
    }),
  );

  it.effect("handles DELETE requests with an empty 204 body", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({ status: 204 });
      const result = yield* runClient(
        request({ url: "/v3/templates/template-id", method: "DELETE" }),
        layer,
      );
      expect(result.status).toBe(204);
      expect(result.body).toBeUndefined();
      expect(requests[0].method).toBe("DELETE");
    }),
  );
});

/** The client over a stub `fetch` under the real `FetchHttpClient`. */
const fetchClient = (respond: Parameters<typeof stubFetch>[0]) => {
  const stub = stubFetch(respond);
  return {
    calls: stub.calls,
    layer: sendGridLayer({ apiKey: Redacted.make(API_KEY) }).pipe(Layer.provide(stub.layer)),
  };
};

describe("SendGridClient over fetch", () => {
  it.effect(
    "refuses to follow redirects, so a 3xx can never carry the bearer token elsewhere",
    () =>
      Effect.gen(function* () {
        const { layer, calls } = fetchClient(() => new Response(null, { status: 204 }));
        yield* runClient(request({ url: "/v3/templates/template-id", method: "DELETE" }), layer);
        expect(calls).toHaveLength(1);
        expect(calls[0].init.redirect).toBe("error");
      }),
  );

  it.effect("layers the redirect refusal over the consumer's own RequestInit defaults", () =>
    Effect.gen(function* () {
      const { layer, calls } = fetchClient(() => new Response(null, { status: 204 }));
      yield* runClient(
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
    }),
  );

  it.effect(
    "surfaces a redirect the fetch refused as a transport SendGridClientError with no status",
    () =>
      Effect.gen(function* () {
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
        const error = yield* asClientError(
          yield* runClient(Effect.flip(request({ url: "/v3/user/profile", method: "GET" })), layer),
        );
        expect(calls).toHaveLength(1);
        expect(error.status).toStrictEqual(Option.none());
        expect(error.message).toContain("unexpected redirect");
        expect(error.message).not.toContain(API_KEY);
      }),
  );

  it.effect("still fails with the status when the error body cannot be read", () =>
    Effect.gen(function* () {
      const { layer } = fetchClient(
        () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new StubFailure({ message: "stream already consumed" }));
              },
            }),
            { status: 500 },
          ),
      );
      const error = yield* asClientError(
        yield* runClient(Effect.flip(request({ url: "/v3/user/profile", method: "GET" })), layer),
      );
      expect(error.status).toStrictEqual(Option.some(500));
      expect(error.message).toContain("500");
    }),
  );
});

describe("Template", () => {
  it.effect("lists templates", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({
        status: 200,
        body: { result: [{ id: "template-1", name: "Test Template", generation: "dynamic" }] },
      });
      const result = yield* runClient(
        Template.list({ generations: "dynamic", page_size: 10 }),
        layer,
      );
      expect(result.status).toBe(200);
      expect(result.body.result).toHaveLength(1);
      expect(result.body.result[0].generation).toBe("dynamic");
      expect(requests[0].method).toBe("GET");
      expect(requests[0].url).toBe(
        "https://api.sendgrid.com/v3/templates?generations=dynamic&page_size=10",
      );
    }),
  );

  it.effect("gets a template by id", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({
        status: 200,
        body: { id: "template-1", name: "Test Template", generation: "dynamic" },
      });
      const result = yield* runClient(Template.get("template-1"), layer);
      expect(result.body.id).toBe("template-1");
      expect(requests[0].url).toBe("https://api.sendgrid.com/v3/templates/template-1");
      expect(requests[0].method).toBe("GET");
    }),
  );

  it.effect("creates a template", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({
        status: 201,
        body: { id: "template-1", name: "New Template", generation: "dynamic" },
      });
      const result = yield* runClient(
        Template.create({ name: "New Template", generation: "dynamic" }),
        layer,
      );
      expect(result.status).toBe(201);
      expect(requests[0].method).toBe("POST");
      expect(requests[0].url).toBe("https://api.sendgrid.com/v3/templates");
      expect(requests[0].body).toEqual(
        Option.some({
          name: "New Template",
          generation: "dynamic",
        }),
      );
    }),
  );

  it.effect("updates a template", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({
        status: 200,
        body: { id: "template-1", name: "Updated Template", generation: "dynamic" },
      });
      const result = yield* runClient(
        Template.update("template-1", { name: "Updated Template" }),
        layer,
      );
      expect(result.body.name).toBe("Updated Template");
      expect(requests[0].method).toBe("PATCH");
      expect(requests[0].url).toBe("https://api.sendgrid.com/v3/templates/template-1");
      expect(requests[0].body).toEqual(Option.some({ name: "Updated Template" }));
    }),
  );

  it.effect("deletes a template", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({ status: 204 });
      const result = yield* runClient(Template.remove("template-1"), layer);
      expect(result.status).toBe(204);
      expect(requests[0].method).toBe("DELETE");
      expect(requests[0].url).toBe("https://api.sendgrid.com/v3/templates/template-1");
    }),
  );

  it.effect("fails with SendGridClientError when the body does not match the resource", () =>
    Effect.gen(function* () {
      const { layer } = client({ status: 200, body: { result: "not-a-list" } });
      const error = yield* asClientError(yield* runClient(Effect.flip(Template.list()), layer));
      expect(error.status).toStrictEqual(Option.some(200));
      expect(error.message).toContain("expected shape");
    }),
  );
});

describe("Contact", () => {
  it.effect("upserts contacts", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({ status: 202, body: { job_id: "job-123" } });
      const result = yield* runClient(
        Contact.upsert([{ email: "test@example.com", first_name: "Test", last_name: "User" }]),
        layer,
      );
      expect(result.status).toBe(202);
      expect(result.body.job_id).toBe("job-123");
      expect(requests[0].method).toBe("PUT");
      expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/contacts");
      expect(requests[0].body).toEqual(
        Option.some({
          contacts: [{ email: "test@example.com", first_name: "Test", last_name: "User" }],
        }),
      );
    }),
  );

  it.effect("searches contacts", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({
        status: 200,
        body: { result: [{ email: "test@example.com" }], contact_count: 1 },
      });
      const result = yield* runClient(Contact.search({ query: "test@example.com" }), layer);
      expect(result.body.contact_count).toBe(1);
      expect(requests[0].method).toBe("POST");
      expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/contacts/search");
      expect(requests[0].body).toEqual(Option.some({ query: "test@example.com" }));
    }),
  );

  it.effect("gets a contact by id", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({
        status: 200,
        body: { id: "contact-1", email: "test@example.com" },
      });
      const result = yield* runClient(Contact.get("contact-1"), layer);
      expect(result.body.id).toBe("contact-1");
      expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/contacts/contact-1");
    }),
  );

  it.effect("deletes contacts by comma-separated ids", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({ status: 202, body: { job_id: "job-123" } });
      const result = yield* runClient(Contact.remove(["contact-1", "contact-2"]), layer);
      expect(result.body.job_id).toBe("job-123");
      expect(requests[0].method).toBe("DELETE");
      expect(requests[0].query).toEqual({ ids: "contact-1,contact-2" });
    }),
  );
});

describe("ApiKey", () => {
  it.effect("lists API keys", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({
        status: 200,
        body: { result: [{ api_key_id: "key-1", name: "Test Key" }] },
      });
      const result = yield* runClient(ApiKey.list({ limit: 10 }), layer);
      expect(result.body.result).toHaveLength(1);
      expect(requests[0].url).toBe("https://api.sendgrid.com/v3/api_keys?limit=10");
    }),
  );

  it.effect("gets an API key by id", () =>
    Effect.gen(function* () {
      const { layer } = client({ status: 200, body: { api_key_id: "key-1", name: "Test Key" } });
      const result = yield* runClient(ApiKey.get("key-1"), layer);
      expect(result.body.api_key_id).toBe("key-1");
    }),
  );

  it.effect("creates an API key", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({
        status: 201,
        body: { api_key_id: "key-1", name: "New Key", api_key: "SG.xxx" },
      });
      const result = yield* runClient(
        ApiKey.create({ name: "New Key", scopes: ["mail.send"] }),
        layer,
      );
      expect(result.status).toBe(201);
      expect(result.body.api_key).toBe("SG.xxx");
      expect(requests[0].body).toEqual(
        Option.some({
          name: "New Key",
          scopes: ["mail.send"],
        }),
      );
    }),
  );

  it.effect("updates an API key", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({
        status: 200,
        body: { api_key_id: "key-1", name: "Updated Key" },
      });
      const result = yield* runClient(ApiKey.update("key-1", "Updated Key"), layer);
      expect(result.body.name).toBe("Updated Key");
      expect(requests[0].method).toBe("PATCH");
      expect(requests[0].body).toEqual(Option.some({ name: "Updated Key" }));
    }),
  );

  it.effect("deletes an API key", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({ status: 204 });
      const result = yield* runClient(ApiKey.remove("key-1"), layer);
      expect(result.status).toBe(204);
      expect(requests[0].url).toBe("https://api.sendgrid.com/v3/api_keys/key-1");
    }),
  );
});

describe("UserProfile", () => {
  it.effect("gets the user profile", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({
        status: 200,
        body: { username: "testuser", email: "test@example.com" },
      });
      const result = yield* runClient(UserProfile.get(), layer);
      expect(result.body.username).toBe("testuser");
      expect(requests[0].method).toBe("GET");
      expect(requests[0].url).toBe("https://api.sendgrid.com/v3/user/profile");
    }),
  );

  it.effect("updates the user profile", () =>
    Effect.gen(function* () {
      const { layer, requests } = client({
        status: 200,
        body: { username: "testuser", email: "updated@example.com" },
      });
      const result = yield* runClient(UserProfile.update({ email: "updated@example.com" }), layer);
      expect(result.body.email).toBe("updated@example.com");
      expect(requests[0].method).toBe("PATCH");
      expect(requests[0].body).toEqual(Option.some({ email: "updated@example.com" }));
    }),
  );
});
