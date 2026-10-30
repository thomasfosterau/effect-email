/**
 * Unit coverage for `./Transport` — the Worker-edge helpers every provider's
 * `configFromEnv`, `resolveTransport(env)` and `noop` are built from. The
 * providers' own suites pin each of those end to end.
 */

import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import {
  boundSecret,
  boundString,
  droppingSender,
  selectTransport,
  SmsService,
  type SmsMessage,
} from "../src/index.ts";

describe("boundString", () => {
  it("is some for a non-blank value, none for absent, null, empty or blank", () => {
    expect(boundString("x")).toStrictEqual(Option.some("x"));
    expect([undefined, null, "", "   "].map(boundString)).toStrictEqual(
      Array.from({ length: 4 }, () => Option.none()),
    );
  });
});

describe("boundSecret", () => {
  it("wraps a plain string and keeps an already-redacted one", () => {
    expect(Option.map(boundSecret("a"), Redacted.value)).toStrictEqual(Option.some("a"));
    const redacted = Redacted.make("b");
    expect(boundSecret(redacted)).toStrictEqual(Option.some(redacted));
  });

  it("is none for absent, null, empty or blank, plain or redacted", () => {
    const values = [undefined, null, "", "  ", Redacted.make(""), Redacted.make(" ")];
    expect(values.map(boundSecret)).toStrictEqual(values.map(() => Option.none()));
  });
});

// A live "provider" that makes one request with the HttpClient it is given.
const live = (host: string) =>
  Layer.effect(
    SmsService,
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const send = (_message: SmsMessage) =>
        http
          .execute(HttpClientRequest.get(`${host}/send`))
          .pipe(Effect.as({ id: Option.some("live") }), Effect.orDie);
      return {
        send,
        sendBatch: (messages) => Effect.forEach(messages, send, { concurrency: 1 }),
      };
    }),
  );

describe("selectTransport", () => {
  const fallback = SmsService.layerRecording([]);

  it("is the fallback, untouched, when the config is none", () => {
    expect(selectTransport(Option.none(), () => fallback, fallback)).toBe(fallback);
  });

  it("builds the live layer from the config, over the platform fetch", async () => {
    const urls: Array<string> = [];
    const fetch: typeof globalThis.fetch = async (input) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return new Response("{}");
    };
    const result = await Effect.runPromise(
      Effect.flatMap(SmsService, (sms) => sms.send({ to: "+61400000000", body: "b" })).pipe(
        Effect.provide(selectTransport(Option.some("https://stub.test"), live, fallback)),
        Effect.provideService(FetchHttpClient.Fetch, fetch),
      ),
    );
    expect(result.id).toStrictEqual(Option.some("live"));
    expect(urls).toEqual(["https://stub.test/send"]);
  });
});

const capture = <A, E>(effect: Effect.Effect<A, E>) => {
  const lines: Array<string> = [];
  const logger = Logger.make(({ message }) => {
    lines.push(String(message));
  });
  return {
    lines,
    run: () => Effect.runPromise(effect.pipe(Effect.provide(Logger.layer([logger])))),
  };
};

describe("droppingSender", () => {
  it("succeeds with no id and logs the provider's line, once per message", async () => {
    const sender = droppingSender<SmsMessage>((message) => `dropping ${message.to.length}`);
    const { lines, run } = capture(
      sender.sendBatch([
        { to: "+61400000001", body: "one" },
        { to: "+61400000002", body: "two" },
      ]),
    );
    const results = await run();
    expect(results.map((result) => result.id)).toStrictEqual([Option.none(), Option.none()]);
    expect(lines).toEqual(["dropping 12", "dropping 12"]);
  });
});
