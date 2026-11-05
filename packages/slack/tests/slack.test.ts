/**
 * The Slack provider's suite: the webhook-URL check before any request, the
 * fixed origin, `redirect: "error"`, truncated error bodies (an unreadable
 * one still failing with the status), the token never reaching an error
 * message, the sequential batch, the no-op transport's logging discipline
 * and the env resolver — with the network stubbed at `FetchHttpClient.Fetch`.
 * No test here reaches Slack.
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
  ChatSendError,
  ChatService,
  UPSTREAM_BODY_LIMIT,
  type ChatMessage,
} from "@thomasfosterau/effect-connect";
import {
  configFromEnv,
  layer,
  layerConfig,
  noop,
  resolveTransport,
  webhookPath,
  type SlackConfigInput,
} from "../src/index.ts";

const TOKEN = "s3cr3tT0k3nXYZ";
const PATH = `/services/T0001/B0002/${TOKEN}`;
const WEBHOOK_URL = `https://hooks.slack.com${PATH}`;
const TEXT = "Deploy 4521 finished";

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  text: TEXT,
  ...overrides,
});

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit;
  readonly headers: Headers;
  /** The JSON body the client sent. */
  readonly body: unknown;
}

class StubFailure extends Schema.TaggedError<StubFailure, { readonly brand: unique symbol }>()(
  "StubFailure",
  {
    message: Schema.String,
  },
) {}

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));

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
      body: text === "" ? undefined : decodeJson(text),
    };
    calls.push(captured);
    return respond(captured);
  };
  return {
    calls,
    http: FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))),
  };
};

const ok = (): Response => new Response("ok", { status: 200 });

const config = (overrides: Partial<SlackConfigInput> = {}): SlackConfigInput => ({
  webhookUrl: Redacted.make(WEBHOOK_URL),
  ...overrides,
});

const sendWith = (
  http: Layer.Layer<HttpClient.HttpClient>,
  input: ChatMessage = message(),
  options: SlackConfigInput = config(),
) =>
  Effect.flatMap(ChatService, (chat) => chat.send(input)).pipe(
    Effect.provide(layer(options).pipe(Layer.provide(http))),
  );

/** The token must never surface in what a caller would log. */
const expectNoCredential = (error: ChatSendError) => {
  expect(error.message).not.toContain(TOKEN);
  expect(error.cause).toBeUndefined();
  expect(String(error)).not.toContain(TOKEN);
};

describe("ChatService.send", () => {
  it.effect("POSTs the JSON body to the webhook's path on Slack's origin", () =>
    Effect.gen(function* () {
      const stub = stubFetch(ok);
      const result = yield* sendWith(stub.http);

      expect(result.id).toStrictEqual(Option.none());
      expect(stub.calls).toHaveLength(1);
      const [request] = stub.calls;
      expect(request.url).toBe(WEBHOOK_URL);
      expect(request.init.method).toBe("POST");
      expect(request.headers.get("content-type")).toContain("application/json");
      expect(request.body).toEqual({ text: TEXT });
    }),
  );

  it.effect("carries a username override", () =>
    Effect.gen(function* () {
      const stub = stubFetch(ok);
      yield* sendWith(stub.http, message({ username: "CI" }));
      expect(stub.calls[0].body).toEqual({ text: TEXT, username: "CI" });
    }),
  );

  it.effect("escapes mass and group mentions by default", () =>
    Effect.gen(function* () {
      const stub = stubFetch(ok);
      const text =
        "<!channel> <!here> <!everyone> <!subteam^S123|team> <@U123> <https://x.test|link>";
      yield* sendWith(stub.http, message({ text }));
      expect(stub.calls[0].body).toEqual({
        text: "&lt;!channel> &lt;!here> &lt;!everyone> &lt;!subteam^S123|team> <@U123> <https://x.test|link>",
      });
    }),
  );

  it.effect("sends mentions as written when the config opts in", () =>
    Effect.gen(function* () {
      const stub = stubFetch(ok);
      const text = "<!here> deploy finished";
      yield* sendWith(stub.http, message({ text }), config({ allowMentions: true }));
      expect(stub.calls[0].body).toEqual({ text });
    }),
  );

  it.effect("still escapes when allowMentions is explicitly undefined or false", () =>
    Effect.gen(function* () {
      const stub = stubFetch(ok);
      const text = "<!here> deploy finished";
      yield* sendWith(stub.http, message({ text }), config({ allowMentions: undefined }));
      yield* sendWith(stub.http, message({ text }), config({ allowMentions: false }));
      expect(stub.calls.map((call) => call.body)).toEqual([
        { text: "&lt;!here> deploy finished" },
        { text: "&lt;!here> deploy finished" },
      ]);
    }),
  );

  (
    [
      ["plain http", `http://hooks.slack.com${PATH}`],
      ["another host", `https://evil.example.test${PATH}`],
      ["a lookalike host", `https://hooks.slack.com.evil.example.test${PATH}`],
      ["a subdomain", `https://x.hooks.slack.com${PATH}`],
      ["a port", `https://hooks.slack.com:8443${PATH}`],
      ["userinfo", `https://user:pass@hooks.slack.com${PATH}`],
      ["a query", `${WEBHOOK_URL}?x=1`],
      ["a fragment", `${WEBHOOK_URL}#x`],
      ["a path outside /services/", `https://hooks.slack.com/triggers/T0001/B0002/${TOKEN}`],
      ["a traversal", `https://hooks.slack.com/services/../api/${TOKEN}`],
      ["too few segments", `https://hooks.slack.com/services/T0001/${TOKEN}`],
      ["not a URL", `hooks.slack.com${PATH}`],
    ] as const
  ).forEach(([label, webhookUrl]) => {
    it.effect(`refuses a webhook URL with ${label}, before any request`, () =>
      Effect.gen(function* () {
        const stub = stubFetch(ok);
        const error = yield* Effect.flip(
          sendWith(stub.http, message(), config({ webhookUrl: Redacted.make(webhookUrl) })),
        );
        expect(error).toBeInstanceOf(ChatSendError);
        expect(error.provider).toBe("slack");
        expect(error.status).toStrictEqual(Option.none());
        expect(error.message).toContain("hooks.slack.com");
        expectNoCredential(error);
        expect(stub.calls).toHaveLength(0);
      }),
    );
  });

  it.effect("refuses to follow redirects, so a 3xx can never carry the token elsewhere", () =>
    Effect.gen(function* () {
      const stub = stubFetch(ok);
      yield* sendWith(stub.http).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, { credentials: "omit" }),
      );
      expect(stub.calls[0].init.redirect).toBe("error");
      expect(stub.calls[0].init.credentials).toBe("omit");
    }),
  );

  it.effect(
    "fails with ChatSendError on a non-2xx, truncating the body and redacting the URL",
    () =>
      Effect.gen(function* () {
        const stub = stubFetch(
          () => new Response(`no_service ${WEBHOOK_URL} ${"x".repeat(5_000)}`, { status: 404 }),
        );
        const error = yield* Effect.flip(sendWith(stub.http));

        expect(error).toBeInstanceOf(ChatSendError);
        expect(error.status).toStrictEqual(Option.some(404));
        expect(error.message).toMatch(/^Slack rejected the request: 404 no_service \[redacted\]/);
        expect(error.message.length).toBeLessThan(UPSTREAM_BODY_LIMIT + 100);
        expectNoCredential(error);
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
      expect(error.message).toBe("Slack rejected the request: 500");
    }),
  );

  it.effect("fails with no status when Slack is unreachable, never naming the URL", () =>
    Effect.gen(function* () {
      const stub = stubFetch(() =>
        Promise.reject(
          new StubFailure({ message: `connect ECONNREFUSED while fetching ${WEBHOOK_URL}` }),
        ),
      );
      const error = yield* Effect.flip(sendWith(stub.http));
      expect(error.status).toStrictEqual(Option.none());
      expect(error.message).toBe(
        "Slack was unreachable: connect ECONNREFUSED while fetching [redacted]",
      );
      expectNoCredential(error);
    }),
  );

  it.effect("fails without naming the URL when the transport gives no message of its own", () =>
    Effect.gen(function* () {
      const stub = stubFetch(() => Promise.reject("opaque"));
      const error = yield* Effect.flip(sendWith(stub.http));
      expect(error.message).toBe("Slack was unreachable: TransportError");
      expectNoCredential(error);
    }),
  );

  it.effect("replaces only the origin with a baseUrl override for a stub server", () =>
    Effect.gen(function* () {
      const stub = stubFetch(ok);
      yield* sendWith(stub.http, message(), config({ baseUrl: "https://stub.local" }));
      expect(stub.calls[0].url).toBe(`https://stub.local${PATH}`);
    }),
  );

  it.effect("still checks the webhook URL under a baseUrl override", () =>
    Effect.gen(function* () {
      const stub = stubFetch(ok);
      const error = yield* Effect.flip(
        sendWith(
          stub.http,
          message(),
          config({
            baseUrl: "https://stub.local",
            webhookUrl: Redacted.make("https://stub.local/x"),
          }),
        ),
      );
      expect(error.status).toStrictEqual(Option.none());
      expect(stub.calls).toHaveLength(0);
    }),
  );
});

describe("ChatService.sendBatch", () => {
  it.effect("posts one message at a time, in order", () =>
    Effect.gen(function* () {
      let inFlight = 0;
      let peak = 0;
      const stub = stubFetch(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return ok();
      });
      const results = yield* Effect.flatMap(ChatService, (chat) =>
        chat.sendBatch([
          message({ text: "one" }),
          message({ text: "two" }),
          message({ text: "three" }),
        ]),
      ).pipe(Effect.provide(layer(config()).pipe(Layer.provide(stub.http))));
      expect(results).toHaveLength(3);
      expect(peak).toBe(1);
      expect(stub.calls.map((call) => call.body)).toEqual([
        { text: "one" },
        { text: "two" },
        { text: "three" },
      ]);
    }),
  );

  it.effect("fails the whole batch on the first failure, sending nothing after it", () =>
    Effect.gen(function* () {
      const stub = stubFetch((request) =>
        P.isObject(request.body) && "text" in request.body && request.body.text === "two"
          ? new Response("invalid_payload", { status: 400 })
          : ok(),
      );
      const error = yield* Effect.flip(
        Effect.flatMap(ChatService, (chat) =>
          chat.sendBatch([
            message({ text: "one" }),
            message({ text: "two" }),
            message({ text: "three" }),
          ]),
        ).pipe(Effect.provide(layer(config()).pipe(Layer.provide(stub.http)))),
      );
      expect(error.status).toStrictEqual(Option.some(400));
      expect(stub.calls).toHaveLength(2);
    }),
  );
});

describe("webhookPath", () => {
  it("answers the path of a Slack webhook URL", () => {
    expect(webhookPath(WEBHOOK_URL)).toStrictEqual(Option.some(PATH));
    // The default port is normalised away by the URL parser.
    expect(webhookPath(`https://hooks.slack.com:443${PATH}`)).toStrictEqual(Option.some(PATH));
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
  it.effect("succeeds without an id and logs neither the text nor the URL", () =>
    Effect.gen(function* () {
      const { effect, lines } = withCapturedLogs(
        Effect.flatMap(ChatService, (chat) => chat.send(message())).pipe(Effect.provide(noop)),
      );
      const result = yield* effect;
      expect(result.id).toStrictEqual(Option.none());
      const logged = lines.join(" ");
      expect(logged).toContain("Slack");
      expect(logged).not.toContain(TEXT);
      expect(logged).not.toContain(TOKEN);
    }),
  );

  it.effect("drops a batch one message at a time, answering one result per message", () =>
    Effect.gen(function* () {
      const { effect, lines } = withCapturedLogs(
        Effect.flatMap(ChatService, (chat) => chat.sendBatch([message(), message()])).pipe(
          Effect.provide(noop),
        ),
      );
      expect(yield* effect).toHaveLength(2);
      expect(lines).toHaveLength(2);
    }),
  );
});

describe("configFromEnv", () => {
  it("is none unless SLACK_WEBHOOK_URL is bound and non-blank", () => {
    expect(configFromEnv({})).toStrictEqual(Option.none());
    expect(configFromEnv({ SLACK_WEBHOOK_URL: null })).toStrictEqual(Option.none());
    expect(configFromEnv({ SLACK_WEBHOOK_URL: "  " })).toStrictEqual(Option.none());
    expect(configFromEnv({ SLACK_WEBHOOK_URL: Redacted.make("") })).toStrictEqual(Option.none());
  });

  it("wraps a plain string binding in Redacted and keeps a Redacted one", () => {
    const plain = configFromEnv({ SLACK_WEBHOOK_URL: WEBHOOK_URL });
    expect(Option.map(plain, (c) => Redacted.value(c.webhookUrl))).toStrictEqual(
      Option.some(WEBHOOK_URL),
    );
    const redacted = Redacted.make(WEBHOOK_URL);
    expect(
      Option.map(configFromEnv({ SLACK_WEBHOOK_URL: redacted }), (c) => c.webhookUrl),
    ).toStrictEqual(Option.some(redacted));
  });
});

describe("resolveTransport", () => {
  it("returns the no-op transport when no webhook is bound", () => {
    expect(resolveTransport({})).toBe(noop);
  });

  it.effect("posts to the bound webhook over the platform fetch", () => {
    const urls: Array<string> = [];
    const fetch: typeof globalThis.fetch = async (input) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return ok();
    };
    return Effect.gen(function* () {
      yield* Effect.flatMap(ChatService, (chat) => chat.send(message()));
      expect(urls).toEqual([WEBHOOK_URL]);
    }).pipe(
      Effect.provide(resolveTransport({ SLACK_WEBHOOK_URL: WEBHOOK_URL })),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    );
  });
});

const sendUnder = (
  env: Record<string, string>,
  http: Layer.Layer<HttpClient.HttpClient>,
  input: ChatMessage = message(),
) =>
  Effect.flatMap(ChatService, (chat) => chat.send(input)).pipe(
    Effect.provide(
      layerConfig.pipe(
        Layer.provide(http),
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env }))),
      ),
    ),
  );

describe("layerConfig", () => {
  it.effect("reads SLACK_WEBHOOK_URL through effect/Config", () =>
    Effect.gen(function* () {
      const stub = stubFetch(ok);
      yield* sendUnder({ SLACK_WEBHOOK_URL: WEBHOOK_URL }, stub.http);
      expect(stub.calls[0].url).toBe(WEBHOOK_URL);
    }),
  );

  it.effect("keeps mentions suppressed", () =>
    Effect.gen(function* () {
      const stub = stubFetch(ok);
      yield* sendUnder(
        { SLACK_WEBHOOK_URL: WEBHOOK_URL },
        stub.http,
        message({ text: "<!channel> deploy finished" }),
      );
      expect(stub.calls[0].body).toEqual({ text: "&lt;!channel> deploy finished" });
    }),
  );

  it.effect("fails at layer construction when SLACK_WEBHOOK_URL is empty", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(sendUnder({ SLACK_WEBHOOK_URL: "" }, FetchHttpClient.layer));
      expect(exit._tag).toBe("Failure");
    }),
  );
});
