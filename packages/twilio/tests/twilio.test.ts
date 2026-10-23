/**
 * The Twilio provider's suite: the transport properties the Resend provider
 * pins (fixed endpoint, Basic credential, `redirect: "error"`, truncated
 * error bodies, an unreadable error body still failing with the status),
 * the account-SID guard on the URL path, sender resolution, the no-op
 * transport's logging discipline and the env resolver, for SMS and for
 * WhatsApp (which shares the one request path) — with the network
 * stubbed at `FetchHttpClient.Fetch`. No test here reaches Twilio.
 */

import { describe, expect, it } from "vite-plus/test";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import type * as HttpClient from "effect/http/HttpClient";
import {
  SmsSendError,
  SmsService,
  UPSTREAM_BODY_LIMIT,
  WhatsAppSendError,
  WhatsAppService,
  type SmsMessage,
  type WhatsAppMessage,
  type WhatsAppTextMessage,
} from "@thomasfosterau/effect-connect";
import {
  configFromEnv,
  layer,
  layerConfig,
  layerWhatsApp,
  layerWhatsAppConfig,
  noop,
  noopWhatsApp,
  resolveTransport,
  resolveWhatsAppTransport,
  toTwilioParams,
  toTwilioWhatsAppParams,
  type TwilioConfigInput,
} from "../src/index.ts";

const ACCOUNT_SID = `AC${"a".repeat(32)}`;
const AUTH_TOKEN = "test-auth-token";
const CODE = "Your code is 918273";
const TO = "+61412345678";

const message = (overrides: Partial<SmsMessage> = {}): SmsMessage => ({
  to: TO,
  body: CODE,
  ...overrides,
});

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit;
  readonly headers: Headers;
  /** The form fields the client sent. */
  readonly form: Record<string, string>;
}

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Json));

const textOf = (raw: BodyInit | null | undefined): string =>
  Predicate.isString(raw)
    ? raw
    : raw instanceof Uint8Array
      ? new TextDecoder().decode(raw)
      : raw instanceof URLSearchParams
        ? raw.toString()
        : "";

const stubFetch = (respond: (request: CapturedRequest) => Response | Promise<Response>) => {
  const calls: Array<CapturedRequest> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const captured: CapturedRequest = {
      url: String(input),
      init: init ?? {},
      headers: new Headers(init?.headers),
      form: Record.fromEntries(new URLSearchParams(textOf(init?.body))),
    };
    calls.push(captured);
    return respond(captured);
  };
  return {
    calls,
    http: FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))),
  };
};

const json = (body: Schema.Json, status = 201): Response =>
  new Response(encodeJson(body), { status, headers: { "content-type": "application/json" } });

const config = (overrides: Partial<TwilioConfigInput> = {}): TwilioConfigInput => ({
  accountSid: ACCOUNT_SID,
  authToken: Redacted.make(AUTH_TOKEN),
  from: "+61400000000",
  ...overrides,
});

const sendWith = (
  http: Layer.Layer<HttpClient.HttpClient>,
  input: SmsMessage = message(),
  options: TwilioConfigInput = config(),
) =>
  Effect.flatMap(SmsService, (sms) => sms.send(input)).pipe(
    Effect.provide(layer(options).pipe(Layer.provide(http))),
  );

const basic = (user: string, password: string): string => `Basic ${btoa(`${user}:${password}`)}`;

describe("SmsService.send", () => {
  it("POSTs the form to the account's Messages resource with a Basic credential", async () => {
    const stub = stubFetch(() => json({ sid: "SM1", status: "queued" }));
    const result = await Effect.runPromise(sendWith(stub.http));

    expect(result.id).toStrictEqual(Option.some("SM1"));
    expect(stub.calls).toHaveLength(1);
    const [request] = stub.calls;
    expect(request.url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
    );
    expect(request.init.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe(basic(ACCOUNT_SID, AUTH_TOKEN));
    expect(request.headers.get("content-type")).toContain("application/x-www-form-urlencoded");
    expect(request.form).toEqual({ To: TO, From: "+61400000000", Body: CODE });
  });

  it("authenticates as the API key when one is configured", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    await Effect.runPromise(
      sendWith(stub.http, message(), config({ apiKeySid: "SKkey", authToken: Redacted.make("s") })),
    );
    expect(stub.calls[0].headers.get("authorization")).toBe(basic("SKkey", "s"));
    // The URL still names the account, not the key.
    expect(stub.calls[0].url).toContain(`/Accounts/${ACCOUNT_SID}/`);
  });

  it("prefers the message's own sender over the configured default", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    await Effect.runPromise(sendWith(stub.http, message({ from: "Example" })));
    expect(stub.calls[0].form.From).toBe("Example");
  });

  it("sends through a Messaging Service when one is configured", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    await Effect.runPromise(
      sendWith(stub.http, message(), config({ from: undefined, messagingServiceSid: "MG1" })),
    );
    expect(stub.calls[0].form).toEqual({ To: TO, Body: CODE, MessagingServiceSid: "MG1" });
  });

  it("refuses a send with no sender at all, before any request", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    const error = await Effect.runPromise(
      Effect.flip(sendWith(stub.http, message(), config({ from: undefined }))),
    );
    expect(error).toBeInstanceOf(SmsSendError);
    expect(error.status).toStrictEqual(Option.none());
    expect(error.message).toContain("no sender");
    expect(stub.calls).toHaveLength(0);
  });

  it("refuses an account SID that is not AC + 32 hex digits, so nothing can steer the path", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    const error = await Effect.runPromise(
      Effect.flip(sendWith(stub.http, message(), config({ accountSid: "../../evil" }))),
    );
    expect(error.message).toContain("account SID");
    expect(stub.calls).toHaveLength(0);
  });

  it("refuses to follow redirects, so a 3xx can never carry the credential elsewhere", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    await Effect.runPromise(
      sendWith(stub.http).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, { credentials: "omit" }),
      ),
    );
    expect(stub.calls[0].init.redirect).toBe("error");
    expect(stub.calls[0].init.credentials).toBe("omit");
  });

  it("fails with SmsSendError on a non-2xx, truncating the upstream body", async () => {
    const stub = stubFetch(() => new Response("x".repeat(5_000), { status: 400 }));
    const error = await Effect.runPromise(Effect.flip(sendWith(stub.http)));

    expect(error).toBeInstanceOf(SmsSendError);
    expect(error.provider).toBe("twilio");
    expect(error.status).toStrictEqual(Option.some(400));
    expect(error.message).toMatch(/400/);
    expect(error.message.length).toBeLessThan(UPSTREAM_BODY_LIMIT + 100);
    expect(error.message).not.toContain(AUTH_TOKEN);
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

  it("fails with SmsSendError and no status when Twilio is unreachable", async () => {
    const stub = stubFetch(() => Promise.reject(new Error("network down")));
    const error = await Effect.runPromise(Effect.flip(sendWith(stub.http)));
    expect(error.status).toStrictEqual(Option.none());
    expect(error.message).toContain("unreachable");
  });

  it("fails when a 2xx body is not the shape Twilio documents", async () => {
    const stub = stubFetch(() => json({ ok: true }));
    const error = await Effect.runPromise(Effect.flip(sendWith(stub.http)));
    expect(error.status).toStrictEqual(Option.some(201));
    expect(error.message).toContain("unexpected body");
  });

  it("honours a baseUrl override for a stub server", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    await Effect.runPromise(
      sendWith(stub.http, message(), config({ baseUrl: "https://stub.local" })),
    );
    expect(stub.calls[0].url).toBe(
      `https://stub.local/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
    );
  });
});

describe("SmsService.sendBatch", () => {
  it("sends each message on its own and answers the ids in order", async () => {
    const stub = stubFetch((request) => json({ sid: `SM-${request.form.Body}` }));
    const results = await Effect.runPromise(
      Effect.flatMap(SmsService, (sms) =>
        sms.sendBatch([message({ body: "one" }), message({ body: "two" })]),
      ).pipe(Effect.provide(layer(config()).pipe(Layer.provide(stub.http)))),
    );
    expect(results.map((result) => result.id)).toStrictEqual([
      Option.some("SM-one"),
      Option.some("SM-two"),
    ]);
    expect(stub.calls).toHaveLength(2);
  });

  it("fails the whole batch on the first failure", async () => {
    const stub = stubFetch((request) =>
      request.form.Body === "two" ? new Response("no", { status: 400 }) : json({ sid: "SM1" }),
    );
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.flatMap(SmsService, (sms) =>
          sms.sendBatch([message({ body: "one" }), message({ body: "two" })]),
        ).pipe(Effect.provide(layer(config()).pipe(Layer.provide(stub.http)))),
      ),
    );
    expect(error.status).toStrictEqual(Option.some(400));
  });
});

describe("toTwilioParams", () => {
  it("is none when neither the message nor the defaults name a sender", () => {
    expect(
      toTwilioParams(message(), { from: Option.none(), messagingServiceSid: Option.none() }),
    ).toStrictEqual(Option.none());
  });

  it("carries both From and the Messaging Service when both are set", () => {
    expect(
      toTwilioParams(message({ from: "Example" }), {
        from: Option.none(),
        messagingServiceSid: Option.some("MG1"),
      }),
    ).toStrictEqual(
      Option.some({ To: TO, Body: CODE, From: "Example", MessagingServiceSid: "MG1" }),
    );
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
  it("succeeds without an id and logs neither the recipient nor the body", async () => {
    const { effect, lines } = withCapturedLogs(
      Effect.flatMap(SmsService, (sms) => sms.send(message())).pipe(Effect.provide(noop)),
    );
    const result = await Effect.runPromise(effect);
    expect(result.id).toStrictEqual(Option.none());
    const logged = lines.join(" ");
    expect(logged).toContain("Twilio");
    // The body is a one-time code; the number is PII.
    expect(logged).not.toContain(TO);
    expect(logged).not.toContain("918273");
  });

  it("drops a batch one message at a time, answering one result per message", async () => {
    const { effect, lines } = withCapturedLogs(
      Effect.flatMap(SmsService, (sms) => sms.sendBatch([message(), message()])).pipe(
        Effect.provide(noop),
      ),
    );
    expect(await Effect.runPromise(effect)).toHaveLength(2);
    expect(lines).toHaveLength(2);
  });
});

describe("configFromEnv", () => {
  it("is none unless both the account SID and the auth token are bound and non-blank", () => {
    expect(configFromEnv({})).toStrictEqual(Option.none());
    expect(configFromEnv({ TWILIO_ACCOUNT_SID: ACCOUNT_SID })).toStrictEqual(Option.none());
    expect(configFromEnv({ TWILIO_AUTH_TOKEN: AUTH_TOKEN })).toStrictEqual(Option.none());
    expect(
      configFromEnv({ TWILIO_ACCOUNT_SID: "  ", TWILIO_AUTH_TOKEN: AUTH_TOKEN }),
    ).toStrictEqual(Option.none());
    expect(
      configFromEnv({ TWILIO_ACCOUNT_SID: ACCOUNT_SID, TWILIO_AUTH_TOKEN: Redacted.make(" ") }),
    ).toStrictEqual(Option.none());
  });

  it("reads the optional bindings, treating blank ones as unset", () => {
    const resolved = configFromEnv({
      TWILIO_ACCOUNT_SID: ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: AUTH_TOKEN,
      TWILIO_FROM: "Example",
      TWILIO_MESSAGING_SERVICE_SID: "",
      TWILIO_API_KEY_SID: null,
    });
    expect(
      Option.map(resolved, (config) => ({
        ...config,
        authToken: Redacted.value(config.authToken),
      })),
    ).toStrictEqual(
      Option.some({
        accountSid: ACCOUNT_SID,
        authToken: AUTH_TOKEN,
        apiKeySid: undefined,
        from: "Example",
        whatsappFrom: undefined,
        messagingServiceSid: undefined,
      }),
    );
  });
});

describe("resolveTransport", () => {
  it("returns the no-op transport when no credential is configured", () => {
    expect(resolveTransport({})).toBe(noop);
  });

  it("hands the live transport the configured credential, over the platform fetch", async () => {
    const calls: Array<Headers> = [];
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      calls.push(new Headers(init?.headers));
      return json({ sid: "SM1" });
    };
    await Effect.runPromise(
      Effect.flatMap(SmsService, (sms) => sms.send(message())).pipe(
        Effect.provide(
          resolveTransport({
            TWILIO_ACCOUNT_SID: ACCOUNT_SID,
            TWILIO_AUTH_TOKEN: AUTH_TOKEN,
            TWILIO_FROM: "Example",
          }),
        ),
        Effect.provideService(FetchHttpClient.Fetch, fetch),
      ),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].get("authorization")).toBe(basic(ACCOUNT_SID, AUTH_TOKEN));
  });
});

describe("layerConfig", () => {
  const sendUnder = (env: Record<string, string>, http: Layer.Layer<HttpClient.HttpClient>) =>
    Effect.flatMap(SmsService, (sms) => sms.send(message())).pipe(
      Effect.provide(
        layerConfig.pipe(
          Layer.provide(http),
          Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env }))),
        ),
      ),
    );

  it("reads the TWILIO_* variables through effect/Config", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    await Effect.runPromise(
      sendUnder(
        {
          TWILIO_ACCOUNT_SID: ACCOUNT_SID,
          TWILIO_AUTH_TOKEN: AUTH_TOKEN,
          TWILIO_API_KEY_SID: "SKkey",
          TWILIO_MESSAGING_SERVICE_SID: "MG1",
          TWILIO_BASE_URL: "https://stub.local",
        },
        stub.http,
      ),
    );
    expect(stub.calls[0].url).toBe(
      `https://stub.local/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
    );
    expect(stub.calls[0].headers.get("authorization")).toBe(basic("SKkey", AUTH_TOKEN));
    expect(stub.calls[0].form.MessagingServiceSid).toBe("MG1");
  });

  it("treats empty optional variables as unset", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    await Effect.runPromise(
      sendUnder(
        {
          TWILIO_ACCOUNT_SID: ACCOUNT_SID,
          TWILIO_AUTH_TOKEN: AUTH_TOKEN,
          TWILIO_FROM: "Example",
          TWILIO_API_KEY_SID: "",
          TWILIO_BASE_URL: "",
        },
        stub.http,
      ),
    );
    expect(stub.calls[0].url).toContain("https://api.twilio.com/");
    expect(stub.calls[0].headers.get("authorization")).toBe(basic(ACCOUNT_SID, AUTH_TOKEN));
  });

  it("fails at layer construction when TWILIO_AUTH_TOKEN is empty", async () => {
    const exit = await Effect.runPromiseExit(
      sendUnder({ TWILIO_ACCOUNT_SID: ACCOUNT_SID, TWILIO_AUTH_TOKEN: "" }, FetchHttpClient.layer),
    );
    expect(exit._tag).toBe("Failure");
  });
});

// ── WhatsApp ──────────────────────────────────────────────────────────────

const WA_FROM = "+61400000001";

const text = (overrides: Partial<Omit<WhatsAppTextMessage, "_tag">> = {}): WhatsAppTextMessage => ({
  _tag: "Text",
  to: TO,
  body: CODE,
  ...overrides,
});

const template = (variables?: Record<string, string>): WhatsAppMessage => ({
  _tag: "Template",
  to: TO,
  template: variables === undefined ? { id: "HXabc" } : { id: "HXabc", variables },
});

const waConfig = (overrides: Partial<TwilioConfigInput> = {}): TwilioConfigInput =>
  config({ whatsappFrom: WA_FROM, ...overrides });

const sendWhatsAppWith = (
  http: Layer.Layer<HttpClient.HttpClient>,
  input: WhatsAppMessage = text(),
  options: TwilioConfigInput = waConfig(),
) =>
  Effect.flatMap(WhatsAppService, (whatsapp) => whatsapp.send(input)).pipe(
    Effect.provide(layerWhatsApp(options).pipe(Layer.provide(http))),
  );

describe("WhatsAppService.send", () => {
  it("POSTs a text message to the same Messages resource, whatsapp:-prefixed", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    const result = await Effect.runPromise(sendWhatsAppWith(stub.http));

    expect(result.id).toStrictEqual(Option.some("SM1"));
    const [request] = stub.calls;
    expect(request.url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
    );
    expect(request.init.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe(basic(ACCOUNT_SID, AUTH_TOKEN));
    expect(request.form).toEqual({
      To: `whatsapp:${TO}`,
      From: `whatsapp:${WA_FROM}`,
      Body: CODE,
    });
  });

  it("sends a template as ContentSid and JSON-encoded ContentVariables, without a Body", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    await Effect.runPromise(sendWhatsAppWith(stub.http, template({ "1": "918273", name: "Ada" })));
    expect(stub.calls[0].form).toEqual({
      To: `whatsapp:${TO}`,
      From: `whatsapp:${WA_FROM}`,
      ContentSid: "HXabc",
      ContentVariables: encodeJson({ "1": "918273", name: "Ada" }),
    });
  });

  it("omits ContentVariables for a template without variables", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    await Effect.runPromise(sendWhatsAppWith(stub.http, template()));
    expect(stub.calls[0].form).toEqual({
      To: `whatsapp:${TO}`,
      From: `whatsapp:${WA_FROM}`,
      ContentSid: "HXabc",
    });
  });

  it("prefers the message's own sender, and never double-prefixes a configured one", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    await Effect.runPromise(sendWhatsAppWith(stub.http, text({ from: "+61400000002" })));
    await Effect.runPromise(
      sendWhatsAppWith(stub.http, text(), waConfig({ whatsappFrom: `whatsapp:${WA_FROM}` })),
    );
    expect(stub.calls.map((call) => call.form.From)).toEqual([
      "whatsapp:+61400000002",
      `whatsapp:${WA_FROM}`,
    ]);
  });

  it("sends through a configured Messaging Service", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    await Effect.runPromise(
      sendWhatsAppWith(stub.http, text(), config({ from: undefined, messagingServiceSid: "MG1" })),
    );
    expect(stub.calls[0].form).toEqual({
      To: `whatsapp:${TO}`,
      Body: CODE,
      MessagingServiceSid: "MG1",
    });
  });

  it("never falls back on the SMS sender, refusing before any request", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    // `config()` sets the SMS `from` only.
    const error = await Effect.runPromise(
      Effect.flip(sendWhatsAppWith(stub.http, text(), config())),
    );
    expect(error).toBeInstanceOf(WhatsAppSendError);
    expect(error.status).toStrictEqual(Option.none());
    expect(error.message).toContain("no sender");
    expect(error.message).toContain("whatsappFrom");
    expect(stub.calls).toHaveLength(0);
  });

  it("applies the account-SID guard, making no request", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    const error = await Effect.runPromise(
      Effect.flip(sendWhatsAppWith(stub.http, text(), waConfig({ accountSid: "../../evil" }))),
    );
    expect(error).toBeInstanceOf(WhatsAppSendError);
    expect(error.message).toContain("account SID");
    expect(stub.calls).toHaveLength(0);
  });

  it("refuses to follow redirects over the consumer's own RequestInit", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    await Effect.runPromise(
      sendWhatsAppWith(stub.http).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, { credentials: "omit" }),
      ),
    );
    expect(stub.calls[0].init.redirect).toBe("error");
    expect(stub.calls[0].init.credentials).toBe("omit");
  });

  it("fails with WhatsAppSendError on a non-2xx, truncating the upstream body", async () => {
    const stub = stubFetch(() => new Response("x".repeat(5_000), { status: 400 }));
    const error = await Effect.runPromise(
      Effect.flip(sendWhatsAppWith(stub.http, template({ "1": "918273" }))),
    );
    expect(error).toBeInstanceOf(WhatsAppSendError);
    expect(error.provider).toBe("twilio");
    expect(error.status).toStrictEqual(Option.some(400));
    expect(error.message.length).toBeLessThan(UPSTREAM_BODY_LIMIT + 100);
    expect(error.message).not.toContain(AUTH_TOKEN);
    expect(error.message).not.toContain("918273");
  });

  it("fails with no status when Twilio is unreachable, and on an unexpected 2xx body", async () => {
    const down = stubFetch(() => Promise.reject(new Error("network down")));
    const unreachable = await Effect.runPromise(Effect.flip(sendWhatsAppWith(down.http)));
    expect(unreachable.status).toStrictEqual(Option.none());
    expect(unreachable.message).toContain("unreachable");

    const odd = stubFetch(() => json({ ok: true }));
    const unexpected = await Effect.runPromise(Effect.flip(sendWhatsAppWith(odd.http)));
    expect(unexpected.status).toStrictEqual(Option.some(201));
    expect(unexpected.message).toContain("unexpected body");
  });
});

describe("WhatsAppService.sendBatch", () => {
  it("sends each message on its own and answers the ids in order", async () => {
    const stub = stubFetch((request) =>
      json({ sid: `SM-${request.form.Body ?? request.form.ContentSid}` }),
    );
    const results = await Effect.runPromise(
      Effect.flatMap(WhatsAppService, (whatsapp) =>
        whatsapp.sendBatch([text({ body: "one" }), template()]),
      ).pipe(Effect.provide(layerWhatsApp(waConfig()).pipe(Layer.provide(stub.http)))),
    );
    expect(results.map((result) => result.id)).toStrictEqual([
      Option.some("SM-one"),
      Option.some("SM-HXabc"),
    ]);
  });
});

describe("toTwilioWhatsAppParams", () => {
  it("is none when neither the message nor the defaults name a sender", () => {
    expect(
      toTwilioWhatsAppParams(text(), { from: Option.none(), messagingServiceSid: Option.none() }),
    ).toStrictEqual(Option.none());
  });
});

describe("noopWhatsApp", () => {
  it("succeeds without an id and logs neither the recipient, the body nor the variables", async () => {
    const { effect, lines } = withCapturedLogs(
      Effect.flatMap(WhatsAppService, (whatsapp) =>
        whatsapp.sendBatch([text(), template({ "1": "918273" })]),
      ).pipe(Effect.provide(noopWhatsApp)),
    );
    const results = await Effect.runPromise(effect);
    expect(results.map((result) => result.id)).toStrictEqual([Option.none(), Option.none()]);
    expect(lines).toHaveLength(2);
    const logged = lines.join(" ");
    expect(logged).toContain("WhatsApp");
    expect(logged).not.toContain(TO);
    expect(logged).not.toContain("918273");
    expect(logged).not.toContain("HXabc");
  });
});

describe("WhatsApp configuration", () => {
  it("reads TWILIO_WHATSAPP_FROM from a Worker env", () => {
    const resolved = configFromEnv({
      TWILIO_ACCOUNT_SID: ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: AUTH_TOKEN,
      TWILIO_WHATSAPP_FROM: WA_FROM,
    });
    expect(Option.map(resolved, (input) => input.whatsappFrom)).toStrictEqual(Option.some(WA_FROM));
  });

  it("resolveWhatsAppTransport is the no-op without a credential, the live sender with one", async () => {
    expect(resolveWhatsAppTransport({})).toBe(noopWhatsApp);

    const forms: Array<Record<string, string>> = [];
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      forms.push(Record.fromEntries(new URLSearchParams(textOf(init?.body))));
      return json({ sid: "SM1" });
    };
    await Effect.runPromise(
      Effect.flatMap(WhatsAppService, (whatsapp) => whatsapp.send(text())).pipe(
        Effect.provide(
          resolveWhatsAppTransport({
            TWILIO_ACCOUNT_SID: ACCOUNT_SID,
            TWILIO_AUTH_TOKEN: AUTH_TOKEN,
            TWILIO_FROM: "Example",
            TWILIO_WHATSAPP_FROM: WA_FROM,
          }),
        ),
        Effect.provideService(FetchHttpClient.Fetch, fetch),
      ),
    );
    expect(forms[0].From).toBe(`whatsapp:${WA_FROM}`);
  });

  it("layerWhatsAppConfig reads TWILIO_WHATSAPP_FROM through effect/Config", async () => {
    const stub = stubFetch(() => json({ sid: "SM1" }));
    await Effect.runPromise(
      Effect.flatMap(WhatsAppService, (whatsapp) => whatsapp.send(text())).pipe(
        Effect.provide(
          layerWhatsAppConfig.pipe(
            Layer.provide(stub.http),
            Layer.provide(
              ConfigProvider.layer(
                ConfigProvider.fromEnv({
                  env: {
                    TWILIO_ACCOUNT_SID: ACCOUNT_SID,
                    TWILIO_AUTH_TOKEN: AUTH_TOKEN,
                    TWILIO_FROM: "Example",
                    TWILIO_WHATSAPP_FROM: WA_FROM,
                  },
                }),
              ),
            ),
          ),
        ),
      ),
    );
    expect(stub.calls[0].form.From).toBe(`whatsapp:${WA_FROM}`);
  });
});
