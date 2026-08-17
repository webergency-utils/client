# Testing notes

## Rules

- Unit tests live in `tests/` at the project root, not next to `src/` modules.
- Isolate HTTP behind an injected `fetch` implementation. Do not call the network.
- Instantiate a fresh `Client` and mock `fetch` in each test.
- Querystring and CookieJar are pure units — test them without `Client` when the behavior is codec/store-only.

## Anti-Patterns

- Do not hit live websites (the old `@liqd-js/client` scratch test did this).
- Do not share a CookieJar or mock-fetch call log across `it` blocks.
- Do not assert on private fields (`#cookieJar`, `#buffer`).

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
- Do not `vi.stubGlobal('Buffer', undefined)` or delete `globalThis.Buffer` — Vitest internals use `Buffer.concat`. Cover the Buffer-absent path by mocking `getBuffer` from `src/runtime.ts` in `no-buffer.test.ts`.
- `buffer()` returns `Buffer.from(bytes)` when `getBuffer()` is defined, otherwise the `Uint8Array`.
- Browser-like coverage lives in `browser.test.ts` (`@vitest-environment happy-dom`). Keep `node:stream` (`Readable.from`) in `client.test.ts` only — that file stays on the Node environment.
- Runtime smoke (`scripts/runtime-smoke.mjs`) imports `dist/client.js` and uses only Web APIs. Run after `npm run build` with `node`, `bun`, or `deno run --allow-read`.
- Bun may append `;charset=utf-8` to `Blob.type` (`text/plain;charset=utf-8`). Assert with `startsWith('text/plain')`, not exact equality.
- Bun's `Request` may omit `integrity` / `keepalive` / `referrer`. Probe `new Request(url, init)` and only assert fields the runtime exposes.
