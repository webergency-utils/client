# Testing notes

## Rules

- Unit tests live in `src/tests/`, not next to `src/` modules.
- Isolate HTTP behind an injected `fetch` implementation. Do not call the network.
- Instantiate a fresh `Client` and mock `fetch` in each test.
- Querystring and CookieJar are pure units — test them without `Client` when the behavior is codec/store-only.

## Anti-Patterns

- Do not hit live websites (the old `@liqd-js/client` scratch test did this).
- Do not share a CookieJar or mock-fetch call log across `it` blocks.
- Do not assert on private fields (`#jar`, `#buffer`).

## Mocking Conventions

- Inject `fetch` via `Client` / request `fetch` option.
- Build `Response` objects with `Headers.append('set-cookie', ...)` so `getSetCookie()` works.
- For hanging requests, return a `Promise` that never resolves and use a short `timeout`.
- `Request` is what the mock `fetch` receives — assert `credentials`, `redirect`, `method` on that `Request`.
- `stream()` is a web `ReadableStream`. Consume with `new Response(stream).text()`, not `node:stream`.
- Node request bodies: `Readable.from(['hello'])`. Do not expect `JSON.stringify` of the stream.
- Keep retry tests fast with `retry: { delay: () => 0 }`. Mock `Math.random` only in `retry.test.ts` via the `random` argument of `computeRetryDelay`.
- Progress handlers fire when the mock `fetch` consumes `Request` body (`input.text()`) or when the test reads the `ClientResponse` body.
- `CancelToken.source()` — cancel before the call to assert fetch is skipped; cancel from the mock to abort in-flight.
- CookieJar SameSite: unspecified defaults to Lax; `None` without `Secure` is not stored. `get(url, initiator)` treats an omitted/invalid initiator as first-party. `Client` passes the original request URL (not the previous hop) as initiator so Lax cookies survive login round-trips and are omitted on cross-site hops.
- JSON auto-parse: `application/json` and `*+json` fill `res.data` before the promise resolves. `responseType: 'json'` forces parse; `responseType: 'stream'` skips it so `stream()` is unread.
