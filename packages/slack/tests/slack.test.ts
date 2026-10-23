/**
 * The Slack provider's suite: the webhook-URL check before any request, the
 * fixed origin, `redirect: "error"`, truncated error bodies (an unreadable
 * one still failing with the status), the token never reaching an error
 * message, the sequential batch, the no-op transport's logging discipline
 * and the env resolver — with the network stubbed at `FetchHttpClient.Fetch`.
 * No test here reaches Slack.
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

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));

const textOf = (raw: BodyInit | null | undefined): string =>
  Predicate.isString(raw) ? raw : raw instanceof Uint8Array ? new TextDecoder().decode(raw) : "";

const stubFetch = (respond: (request: CapturedRequest) => Response | Promise<Response>) => {
  const calls: Array<CapturedRequest> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const text = textOf(init?.body);
    const captured: CapturedRequest = {
      url: String(input),
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
  it("POSTs the JSON body to the webhook's path on Slack's origin", async () => {
    const stub = stubFetch(ok);
    const result = await Effect.runPromise(sendWith(stub.http));

    expect(result.id).toStrictEqual(Option.none());
    expect(stub.calls).toHaveLength(1);
    const [request] = stub.calls;
    expect(request.url).toBe(WEBHOOK_URL);
    expect(request.init.method).toBe("POST");
    expect(request.headers.get("content-type")).toContain("application/json");
    expect(request.body).toEqual({ text: TEXT });
  });

  it("carries a username override", async () => {
    const stub = stubFetch(ok);
    await Effect.runPromise(sendWith(stub.http, message({ username: "CI" })));
    expect(stub.calls[0].body).toEqual({ text: TEXT, username: "CI" });
  });

  it.each([
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
  ])("refuses a webhook URL with %s, before any request", async (_label, webhookUrl) => {
    const stub = stubFetch(ok);
    const error = await Effect.runPromise(
      Effect.flip(
        sendWith(stub.http, message(), config({ webhookUrl: Redacted.make(webhookUrl) })),
      ),
    );
    expect(error).toBeInstanceOf(ChatSendError);
    expect(error.provider).toBe("slack");
    expect(error.status).toStrictEqual(Option.none());
    expect(error.message).toContain("hooks.slack.com");
    expectNoCredential(error);
    expect(stub.calls).toHaveLength(0);
  });

  it("refuses to follow redirects, so a 3xx can never carry the token elsewhere", async () => {
    const stub = stubFetch(ok);
    await Effect.runPromise(
      sendWith(stub.http).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, { credentials: "omit" }),
      ),
    );
    expect(stub.calls[0].init.redirect).toBe("error");
    expect(stub.calls[0].init.credentials).toBe("omit");
  });

  it("fails with ChatSendError on a non-2xx, truncating the body and redacting the URL", async () => {
    const stub = stubFetch(
      () => new Response(`no_service ${WEBHOOK_URL} ${"x".repeat(5_000)}`, { status: 404 }),
    );
    const error = await Effect.runPromise(Effect.flip(sendWith(stub.http)));

    expect(error).toBeInstanceOf(ChatSendError);
    expect(error.status).toStrictEqual(Option.some(404));
    expect(error.message).toMatch(/^Slack rejected the request: 404 no_service \[redacted\]/);
    expect(error.message.length).toBeLessThan(UPSTREAM_BODY_LIMIT + 100);
    expectNoCredential(error);
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
    expect(error.message).toBe("Slack rejected the request: 500");
  });

  it("fails with no status when Slack is unreachable, never naming the URL", async () => {
    const stub = stubFetch(() =>
      Promise.reject(new Error(`connect ECONNREFUSED while fetching ${WEBHOOK_URL}`)),
    );
    const error = await Effect.runPromise(Effect.flip(sendWith(stub.http)));
    expect(error.status).toStrictEqual(Option.none());
    expect(error.message).toBe(
      "Slack was unreachable: connect ECONNREFUSED while fetching [redacted]",
    );
    expectNoCredential(error);
  });

  it("fails without naming the URL when the transport gives no message of its own", async () => {
    const stub = stubFetch(() => Promise.reject("opaque"));
    const error = await Effect.runPromise(Effect.flip(sendWith(stub.http)));
    expect(error.message).toBe("Slack was unreachable: TransportError");
    expectNoCredential(error);
  });

  it("replaces only the origin with a baseUrl override for a stub server", async () => {
    const stub = stubFetch(ok);
    await Effect.runPromise(
      sendWith(stub.http, message(), config({ baseUrl: "https://stub.local" })),
    );
    expect(stub.calls[0].url).toBe(`https://stub.local${PATH}`);
  });

  it("still checks the webhook URL under a baseUrl override", async () => {
    const stub = stubFetch(ok);
    const error = await Effect.runPromise(
      Effect.flip(
        sendWith(
          stub.http,
          message(),
          config({
            baseUrl: "https://stub.local",
            webhookUrl: Redacted.make("https://stub.local/x"),
          }),
        ),
      ),
    );
    expect(error.status).toStrictEqual(Option.none());
    expect(stub.calls).toHaveLength(0);
  });
});

describe("ChatService.sendBatch", () => {
  it("posts one message at a time, in order", async () => {
    let inFlight = 0;
    let peak = 0;
    const stub = stubFetch(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return ok();
    });
    const results = await Effect.runPromise(
      Effect.flatMap(ChatService, (chat) =>
        chat.sendBatch([
          message({ text: "one" }),
          message({ text: "two" }),
          message({ text: "three" }),
        ]),
      ).pipe(Effect.provide(layer(config()).pipe(Layer.provide(stub.http)))),
    );
    expect(results).toHaveLength(3);
    expect(peak).toBe(1);
    expect(stub.calls.map((call) => call.body)).toEqual([
      { text: "one" },
      { text: "two" },
      { text: "three" },
    ]);
  });

  it("fails the whole batch on the first failure, sending nothing after it", async () => {
    const stub = stubFetch((request) =>
      Predicate.isObject(request.body) && "text" in request.body && request.body.text === "two"
        ? new Response("invalid_payload", { status: 400 })
        : ok(),
    );
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.flatMap(ChatService, (chat) =>
          chat.sendBatch([
            message({ text: "one" }),
            message({ text: "two" }),
            message({ text: "three" }),
          ]),
        ).pipe(Effect.provide(layer(config()).pipe(Layer.provide(stub.http)))),
      ),
    );
    expect(error.status).toStrictEqual(Option.some(400));
    expect(stub.calls).toHaveLength(2);
  });
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
  it("succeeds without an id and logs neither the text nor the URL", async () => {
    const { effect, lines } = withCapturedLogs(
      Effect.flatMap(ChatService, (chat) => chat.send(message())).pipe(Effect.provide(noop)),
    );
    const result = await Effect.runPromise(effect);
    expect(result.id).toStrictEqual(Option.none());
    const logged = lines.join(" ");
    expect(logged).toContain("Slack");
    expect(logged).not.toContain(TEXT);
    expect(logged).not.toContain(TOKEN);
  });

  it("drops a batch one message at a time, answering one result per message", async () => {
    const { effect, lines } = withCapturedLogs(
      Effect.flatMap(ChatService, (chat) => chat.sendBatch([message(), message()])).pipe(
        Effect.provide(noop),
      ),
    );
    expect(await Effect.runPromise(effect)).toHaveLength(2);
    expect(lines).toHaveLength(2);
  });
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

  it("posts to the bound webhook over the platform fetch", async () => {
    const urls: Array<string> = [];
    const fetch: typeof globalThis.fetch = async (input) => {
      urls.push(String(input));
      return ok();
    };
    await Effect.runPromise(
      Effect.flatMap(ChatService, (chat) => chat.send(message())).pipe(
        Effect.provide(resolveTransport({ SLACK_WEBHOOK_URL: WEBHOOK_URL })),
        Effect.provideService(FetchHttpClient.Fetch, fetch),
      ),
    );
    expect(urls).toEqual([WEBHOOK_URL]);
  });
});

describe("layerConfig", () => {
  const sendUnder = (env: Record<string, string>, http: Layer.Layer<HttpClient.HttpClient>) =>
    Effect.flatMap(ChatService, (chat) => chat.send(message())).pipe(
      Effect.provide(
        layerConfig.pipe(
          Layer.provide(http),
          Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env }))),
        ),
      ),
    );

  it("reads SLACK_WEBHOOK_URL through effect/Config", async () => {
    const stub = stubFetch(ok);
    await Effect.runPromise(sendUnder({ SLACK_WEBHOOK_URL: WEBHOOK_URL }, stub.http));
    expect(stub.calls[0].url).toBe(WEBHOOK_URL);
  });

  it("fails at layer construction when SLACK_WEBHOOK_URL is empty", async () => {
    const exit = await Effect.runPromiseExit(
      sendUnder({ SLACK_WEBHOOK_URL: "" }, FetchHttpClient.layer),
    );
    expect(exit._tag).toBe("Failure");
  });
});
