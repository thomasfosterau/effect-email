/**
 * The Vonage provider's suite: the transport properties the other providers
 * pin (fixed endpoint, Basic credential in the header and never the body,
 * `redirect: "error"`, truncated error bodies, an unreadable error body still
 * failing with the status), Vonage's `+`-less number form, sender
 * resolution, the no-op transport's logging discipline and the env resolver
 * — with the network stubbed at `FetchHttpClient.Fetch`. No test here
 * reaches Vonage.
 */

import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as P from "effect/Predicate";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import type * as HttpClient from "effect/http/HttpClient";
import {
  SmsSendError,
  SmsService,
  UPSTREAM_BODY_LIMIT,
  type SmsMessage,
} from "@thomasfosterau/effect-connect";
import {
  configFromEnv,
  layer,
  layerConfig,
  noop,
  resolveTransport,
  toVonageNumber,
  toVonagePayload,
  type VonageConfigInput,
} from "../src/index.ts";

const API_KEY = "abc123";
const API_SECRET = "test-api-secret";
const CODE = "Your code is 918273";
const TO = "+61412345678";
const UUID = "aaaaaaaa-bbbb-cccc-dddd-0123456789ab";

const message = (overrides: Partial<SmsMessage> = {}): SmsMessage => ({
  to: TO,
  body: CODE,
  ...overrides,
});

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit;
  readonly headers: Headers;
  /** The raw body the client sent. */
  readonly text: string;
  /** The body, parsed as JSON. */
  readonly json: Record<string, string>;
}

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Json));
const decodeBody = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)),
);

const textOf = (raw: RequestInit["body"]): string =>
  P.isString(raw) ? raw : raw instanceof Uint8Array ? new TextDecoder().decode(raw) : "";

const stubFetch = (respond: (request: CapturedRequest) => Response | Promise<Response>) => {
  const calls: Array<CapturedRequest> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const text = textOf(init?.body);
    const captured: CapturedRequest = {
      url: input instanceof Request ? input.url : String(input),
      init: init ?? {},
      headers: new Headers(init?.headers),
      text,
      json: text === "" ? {} : decodeBody(text),
    };
    calls.push(captured);
    return respond(captured);
  };
  return {
    calls,
    http: FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))),
  };
};

const json = (body: Schema.Json, status = 202): Response =>
  new Response(encodeJson(body), { status, headers: { "content-type": "application/json" } });

const config = (overrides: Partial<VonageConfigInput> = {}): VonageConfigInput => ({
  apiKey: API_KEY,
  apiSecret: Redacted.make(API_SECRET),
  from: "+61400000000",
  ...overrides,
});

const sendWith = (
  http: Layer.Layer<HttpClient.HttpClient>,
  input: SmsMessage = message(),
  options: VonageConfigInput = config(),
) =>
  Effect.flatMap(SmsService, (sms) => sms.send(input)).pipe(
    Effect.provide(layer(options).pipe(Layer.provide(http))),
  );

const basic = (user: string, password: string): string => `Basic ${btoa(`${user}:${password}`)}`;

/** Stands in for a platform failure: a rejected fetch or an erroring stream. */
class StubFailure extends Schema.TaggedError<StubFailure, { readonly brand: unique symbol }>()(
  "StubFailure",
  {
    message: Schema.String,
  },
) {}

describe("SmsService.send", () => {
  it.effect("POSTs the JSON message to /v1/messages with a Basic credential", () =>
    Effect.gen(function* () {
      const stub = stubFetch(() => json({ message_uuid: UUID }));
      const result = yield* sendWith(stub.http);

      expect(result.id).toStrictEqual(Option.some(UUID));
      expect(stub.calls).toHaveLength(1);
      const [request] = stub.calls;
      expect(request.url).toBe("https://api.nexmo.com/v1/messages");
      expect(request.init.method).toBe("POST");
      expect(request.headers.get("authorization")).toBe(basic(API_KEY, API_SECRET));
      expect(request.headers.get("content-type")).toContain("application/json");
      expect(request.json).toEqual({
        message_type: "text",
        channel: "sms",
        to: "61412345678",
        from: "61400000000",
        text: CODE,
      });
    }),
  );

  it.effect("never puts the credential in the body", () =>
    Effect.gen(function* () {
      const stub = stubFetch(() => json({ message_uuid: UUID }));
      yield* sendWith(stub.http);
      expect(stub.calls[0].text).not.toContain(API_KEY);
      expect(stub.calls[0].text).not.toContain(API_SECRET);
    }),
  );

  it.effect("prefers the message's own sender over the configured default", () =>
    Effect.gen(function* () {
      const stub = stubFetch(() => json({ message_uuid: UUID }));
      yield* sendWith(stub.http, message({ from: "Example" }));
      expect(stub.calls[0].json.from).toBe("Example");
    }),
  );

  it.effect("refuses a send with no sender at all, before any request", () =>
    Effect.gen(function* () {
      const stub = stubFetch(() => json({ message_uuid: UUID }));
      const error = yield* Effect.flip(sendWith(stub.http, message(), config({ from: undefined })));
      expect(error).toBeInstanceOf(SmsSendError);
      expect(error.provider).toBe("vonage");
      expect(error.status).toStrictEqual(Option.none());
      expect(error.message).toContain("no sender");
      expect(stub.calls).toHaveLength(0);
    }),
  );

  it.effect("refuses to follow redirects, so a 3xx can never carry the credential elsewhere", () =>
    Effect.gen(function* () {
      const stub = stubFetch(() => json({ message_uuid: UUID }));
      yield* sendWith(stub.http).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, { credentials: "omit" }),
      );
      expect(stub.calls[0].init.redirect).toBe("error");
      expect(stub.calls[0].init.credentials).toBe("omit");
    }),
  );

  it.effect("fails with SmsSendError on a non-2xx, truncating the upstream body", () =>
    Effect.gen(function* () {
      const stub = stubFetch(() => new Response("x".repeat(5_000), { status: 422 }));
      const error = yield* Effect.flip(sendWith(stub.http));

      expect(error).toBeInstanceOf(SmsSendError);
      expect(error.provider).toBe("vonage");
      expect(error.status).toStrictEqual(Option.some(422));
      expect(error.message).toMatch(/422/);
      expect(error.message.length).toBeLessThan(UPSTREAM_BODY_LIMIT + 100);
      expect(error.message).not.toContain(API_SECRET);
    }),
  );

  it.effect("still fails with the status when the error body cannot be read", () =>
    Effect.gen(function* () {
      const stub = stubFetch(
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
      const error = yield* Effect.flip(sendWith(stub.http));
      expect(error.status).toStrictEqual(Option.some(500));
      expect(error.message).toMatch(/500/);
    }),
  );

  it.effect("fails with SmsSendError and no status when Vonage is unreachable", () =>
    Effect.gen(function* () {
      const stub = stubFetch(() => Promise.reject(new StubFailure({ message: "network down" })));
      const error = yield* Effect.flip(sendWith(stub.http));
      expect(error.status).toStrictEqual(Option.none());
      expect(error.message).toContain("unreachable");
    }),
  );

  it.effect("fails when a 2xx body is not the shape Vonage documents", () =>
    Effect.gen(function* () {
      const stub = stubFetch(() => json({ ok: true }));
      const error = yield* Effect.flip(sendWith(stub.http));
      expect(error.status).toStrictEqual(Option.some(202));
      expect(error.message).toContain("unexpected body");
    }),
  );

  it.effect("honours a baseUrl override for a stub server", () =>
    Effect.gen(function* () {
      const stub = stubFetch(() => json({ message_uuid: UUID }));
      yield* sendWith(stub.http, message(), config({ baseUrl: "https://stub.local" }));
      expect(stub.calls[0].url).toBe("https://stub.local/v1/messages");
    }),
  );
});

describe("SmsService.sendBatch", () => {
  it.effect("sends each message on its own and answers the ids in order", () =>
    Effect.gen(function* () {
      const stub = stubFetch((request) => json({ message_uuid: `uuid-${request.json.text}` }));
      const results = yield* Effect.flatMap(SmsService, (sms) =>
        sms.sendBatch([message({ body: "one" }), message({ body: "two" })]),
      ).pipe(Effect.provide(layer(config()).pipe(Layer.provide(stub.http))));
      expect(results.map((result) => result.id)).toStrictEqual([
        Option.some("uuid-one"),
        Option.some("uuid-two"),
      ]);
      expect(stub.calls).toHaveLength(2);
    }),
  );

  it.effect("fails the whole batch on the first failure", () =>
    Effect.gen(function* () {
      const stub = stubFetch((request) =>
        request.json.text === "two"
          ? new Response("no", { status: 400 })
          : json({ message_uuid: UUID }),
      );
      const error = yield* Effect.flip(
        Effect.flatMap(SmsService, (sms) =>
          sms.sendBatch([message({ body: "one" }), message({ body: "two" })]),
        ).pipe(Effect.provide(layer(config()).pipe(Layer.provide(stub.http)))),
      );
      expect(error.status).toStrictEqual(Option.some(400));
    }),
  );
});

describe("toVonagePayload", () => {
  it("is none when neither the message nor the default names a sender", () => {
    expect(toVonagePayload(message(), Option.none())).toStrictEqual(Option.none());
  });

  it("strips the + from an E.164 sender and passes an alphanumeric one through", () => {
    expect(
      Option.map(toVonagePayload(message({ from: "+61400000000" }), Option.none()), (p) => p.from),
    ).toStrictEqual(Option.some("61400000000"));
    expect(
      Option.map(toVonagePayload(message(), Option.some("Example")), (p) => p.from),
    ).toStrictEqual(Option.some("Example"));
  });

  it("leaves a short code untouched", () => {
    expect(toVonageNumber("12345")).toBe("12345");
  });
});

/** Runs `effect` under a logger that collects every log line. */
const withCapturedLogs = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const lines: Array<string> = [];
  const collecting = Logger.make(({ message: logged }) => {
    lines.push(String(logged));
  });
  return { lines, effect: effect.pipe(Effect.provide(Logger.layer([collecting]))) };
};

describe("noop", () => {
  it.effect("succeeds without an id and logs neither the recipient nor the body", () =>
    Effect.gen(function* () {
      const { effect, lines } = withCapturedLogs(
        Effect.flatMap(SmsService, (sms) => sms.send(message())).pipe(Effect.provide(noop)),
      );
      const result = yield* effect;
      expect(result.id).toStrictEqual(Option.none());
      const logged = lines.join(" ");
      expect(logged).toContain("Vonage");
      // The body is a one-time code; the number is PII.
      expect(logged).not.toContain(TO);
      expect(logged).not.toContain("61412345678");
      expect(logged).not.toContain("918273");
    }),
  );

  it.effect("drops a batch one message at a time, answering one result per message", () =>
    Effect.gen(function* () {
      const { effect, lines } = withCapturedLogs(
        Effect.flatMap(SmsService, (sms) => sms.sendBatch([message(), message()])).pipe(
          Effect.provide(noop),
        ),
      );
      expect(yield* effect).toHaveLength(2);
      expect(lines).toHaveLength(2);
    }),
  );
});

const strip = (resolved: Option.Option<VonageConfigInput>) =>
  Option.map(resolved, (input) => ({ ...input, apiSecret: Redacted.value(input.apiSecret) }));

describe("configFromEnv", () => {
  it("is none unless both the API key and the API secret are bound and non-blank", () => {
    expect(configFromEnv({})).toStrictEqual(Option.none());
    expect(configFromEnv({ VONAGE_API_KEY: API_KEY })).toStrictEqual(Option.none());
    expect(configFromEnv({ VONAGE_API_SECRET: API_SECRET })).toStrictEqual(Option.none());
    expect(configFromEnv({ VONAGE_API_KEY: "  ", VONAGE_API_SECRET: API_SECRET })).toStrictEqual(
      Option.none(),
    );
    expect(
      configFromEnv({ VONAGE_API_KEY: API_KEY, VONAGE_API_SECRET: Redacted.make(" ") }),
    ).toStrictEqual(Option.none());
  });

  it("reads the optional sender, treating a blank one as unset", () => {
    expect(
      strip(
        configFromEnv({
          VONAGE_API_KEY: API_KEY,
          VONAGE_API_SECRET: Redacted.make(API_SECRET),
          VONAGE_FROM: "Example",
        }),
      ),
    ).toStrictEqual(Option.some({ apiKey: API_KEY, apiSecret: API_SECRET, from: "Example" }));
    expect(
      strip(
        configFromEnv({ VONAGE_API_KEY: API_KEY, VONAGE_API_SECRET: API_SECRET, VONAGE_FROM: "" }),
      ),
    ).toStrictEqual(Option.some({ apiKey: API_KEY, apiSecret: API_SECRET, from: undefined }));
  });
});

describe("resolveTransport", () => {
  it("returns the no-op transport when no credential is configured", () => {
    expect(resolveTransport({})).toBe(noop);
  });

  it.effect("hands the live transport the configured credential, over the platform fetch", () =>
    Effect.gen(function* () {
      const calls: Array<Headers> = [];
      const fetch: typeof globalThis.fetch = async (_input, init) => {
        calls.push(new Headers(init?.headers));
        return json({ message_uuid: UUID });
      };
      yield* Effect.flatMap(SmsService, (sms) => sms.send(message())).pipe(
        Effect.provide(
          resolveTransport({
            VONAGE_API_KEY: API_KEY,
            VONAGE_API_SECRET: API_SECRET,
            VONAGE_FROM: "Example",
          }),
        ),
        Effect.provideService(FetchHttpClient.Fetch, fetch),
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].get("authorization")).toBe(basic(API_KEY, API_SECRET));
    }),
  );
});

const sendUnder = (env: Record<string, string>, http: Layer.Layer<HttpClient.HttpClient>) =>
  Effect.flatMap(SmsService, (sms) => sms.send(message())).pipe(
    Effect.provide(
      layerConfig.pipe(
        Layer.provide(http),
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env }))),
      ),
    ),
  );

describe("layerConfig", () => {
  it.effect("reads the VONAGE_* variables through effect/Config", () =>
    Effect.gen(function* () {
      const stub = stubFetch(() => json({ message_uuid: UUID }));
      yield* sendUnder(
        {
          VONAGE_API_KEY: API_KEY,
          VONAGE_API_SECRET: API_SECRET,
          VONAGE_FROM: "Example",
          VONAGE_BASE_URL: "https://stub.local",
        },
        stub.http,
      );
      expect(stub.calls[0].url).toBe("https://stub.local/v1/messages");
      expect(stub.calls[0].headers.get("authorization")).toBe(basic(API_KEY, API_SECRET));
      expect(stub.calls[0].json.from).toBe("Example");
    }),
  );

  it.effect("treats empty optional variables as unset", () =>
    Effect.gen(function* () {
      const stub = stubFetch(() => json({ message_uuid: UUID }));
      const error = yield* Effect.flip(
        sendUnder(
          {
            VONAGE_API_KEY: API_KEY,
            VONAGE_API_SECRET: API_SECRET,
            VONAGE_FROM: "",
            VONAGE_BASE_URL: "",
          },
          stub.http,
        ),
      );
      // An empty VONAGE_FROM is no sender at all, so nothing is sent.
      expect(error.message).toContain("no sender");
      expect(stub.calls).toHaveLength(0);
    }),
  );

  it.effect("falls back to the default host when VONAGE_BASE_URL is empty", () =>
    Effect.gen(function* () {
      const stub = stubFetch(() => json({ message_uuid: UUID }));
      yield* sendUnder(
        {
          VONAGE_API_KEY: API_KEY,
          VONAGE_API_SECRET: API_SECRET,
          VONAGE_FROM: "Example",
          VONAGE_BASE_URL: "",
        },
        stub.http,
      );
      expect(stub.calls[0].url).toBe("https://api.nexmo.com/v1/messages");
    }),
  );

  it.effect("fails at layer construction when VONAGE_API_SECRET is empty", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        sendUnder({ VONAGE_API_KEY: API_KEY, VONAGE_API_SECRET: "" }, FetchHttpClient.layer),
      );
      expect(exit._tag).toBe("Failure");
    }),
  );
});
