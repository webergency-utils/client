# @webergency-utils/client

A fetch-based HTTP client with instance defaults, nested querystrings, form encoding, an opt-in cookie jar, and typed errors. It adds axios/ky-style DX on top of global `fetch` without extra runtime dependencies.

[![npm version](https://img.shields.io/npm/v/%40webergency-utils%2Fclient)](https://www.npmjs.com/package/@webergency-utils/client)
[![License](https://img.shields.io/npm/l/%40webergency-utils%2Fclient)](https://www.npmjs.com/package/@webergency-utils/client)
[![Maintenance](https://img.shields.io/badge/maintenance-active-brightgreen.svg)](#maintenance)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/@webergency-utils/client?activeTab=dependencies)
[![npm downloads](https://img.shields.io/npm/dm/%40webergency-utils%2Fclient)](https://www.npmjs.com/package/@webergency-utils/client)<br>
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/webergency-utils/client/badge)](https://securityscorecards.dev/viewer/?uri=github.com/webergency-utils/client)
[![codecov](https://codecov.io/gh/webergency-utils/client/graph/badge.svg?token=)](https://codecov.io/gh/webergency-utils/client)
[![CI](https://github.com/webergency-utils/client/actions/workflows/ci.yml/badge.svg)](https://github.com/webergency-utils/client/actions/workflows/ci.yml)
[![CodeQL](https://github.com/webergency-utils/client/actions/workflows/codeql.yml/badge.svg)](https://github.com/webergency-utils/client/actions/workflows/codeql.yml)

## TL;DR

```typescript
import Client from '@webergency-utils/client';

const iam = new Client({
    webroot : 'https://api.example.com',
    headers : { 'X-Requested-With': 'XMLHttpRequest' },
    timeout : 10_000
});

const session = await iam.get('/auth/session', {
    query : { sessionID: 'abc', account: { id: 1 } }
}).json<{ user: { id: string } }>();
```

## Installation & Setup

```bash
npm install @webergency-utils/client
```

Requires a `fetch` runtime: Node.js 18+, or a browser / Worker with `fetch`, `FormData`, and `AbortSignal.timeout`. No peer dependencies or environment variables. The package does not import `node:stream`.

## Architecture & Internals

`Client` builds a `Request`, runs hooks, and calls injectable `fetch` (global `fetch` by default). HTTP is not reimplemented.

```
options + path → URL / headers / body
    → Cookie header (if cookieJar)
    → beforeRequest
    → fetch
    → store Set-Cookie (if cookieJar)
    → manual redirect follow (jar, maxRedirects, or beforeRedirect)
    → retry (idempotent methods)
    → afterResponse
    → throw HttpError or return ClientResponse
```

- **Querystring** is an in-tree PHP-style codec (`foo[bar][0]=a`), used for `query` and urlencoded bodies. It is not `URLSearchParams`.
- **JSON** is the default for plain object `body` values. `form` / urlencoded `content-type` stringify via the same codec. `multipart` uses platform `FormData`.
- **CookieJar** is opt-in. Native `fetch` does not persist cookies; when a jar is set, redirects are followed manually so intermediate `Set-Cookie` is applied. The same manual follow is used when `maxRedirects` or `beforeRedirect` is set. Cookie lookup uses the original request URL as the SameSite initiator for the whole redirect chain.
- **Errors:** `!ok` throws `HttpError` by default. Opt out with `throwHttpError: false` or `validateStatus`. Network failures and timeouts still throw.
- Dual ESM/CJS build. Zero runtime npm dependencies. No Node built-in imports, so the same bundle loads in browsers and Workers.

## Glossary

- **Client** — HTTP instance with defaults (`webroot`, headers, timeout, retry, hooks, cookie jar).
- **ClientResponse** — wrapper around `Response` with `data` (auto-parsed JSON), `json()`, `text()`, `buffer()`, `stream()`.
- **ClientPromise** — `Promise<ClientResponse>` plus `.json()` / `.text()` / `.buffer()` shortcuts.
- **HttpError** — thrown on HTTP/network/timeout failures (`code`, `status`, `body`).
- **CookieJar** — in-memory RFC-style cookie store, opt-in on `Client`. SameSite defaults to Lax; `None` requires `Secure`.
- **Querystring** — nested query stringify/parse used for `query` and `form`.
- **webroot / baseURL** — base URL joined with relative paths.
- **throwHttpError** — when `false`, 4xx/5xx are returned instead of thrown.
- **validateStatus** — predicate that decides whether a status is success; overrides `throwHttpError`.
- **CancelToken** — axios-style abort; throws `CANCELED`.
- **FetchInit** — `credentials`, `cache`, `mode`, `duplex`, and other `Request` fields passed through to `fetch`.
- **responseType** — `'json'` forces parse onto `data`; `'stream'` skips auto-parse. Default is Content-Type sniffing.

## API Reference

### `Client`

Stateful HTTP client. Default export, also available as a named `Client` export.

```typescript
import Client from '@webergency-utils/client';

const client = new Client({
    webroot        : 'https://api.example.com',
    headers        : { accept: 'application/json' },
    timeout        : 10_000,
    retry          : { limit: 2 },
    throwHttpError : true,
    cookieJar      : false
});
```

#### Constructor `options`

| Name | Type | Default | Description |
|---|---|---|---|
| `webroot` | `string` | — | Base URL. Alias: `baseURL`. |
| `baseURL` | `string` | — | Same as `webroot`. |
| `headers` | `HeadersInit` | — | Default headers; request headers win on conflict. |
| `timeout` | `number` | — | Abort after this many milliseconds. |
| `retry` | `number \| RetryOptions` | `{ limit: 2 }` | Retries for GET/HEAD/PUT/DELETE on network errors and 429/502/503/504. `delay` / `jitter` optional. |
| `hooks` | `ClientHooks` | — | `beforeRequest`, `afterResponse`, `beforeRetry`, `beforeError`, `beforeRedirect` arrays. |
| `throwHttpError` | `boolean` | `true` | Throw `HttpError` when status is not 2xx. |
| `validateStatus` | `(status: number) => boolean` | — | If set, this is the success check (`throwHttpError` is ignored). |
| `cookieJar` | `boolean \| CookieJar` | `false` | `true` creates a jar; pass an instance to share one. |
| `fetch` | `typeof fetch` | global `fetch` | Injected for tests. |
| `maxRedirects` | `number` | — | When set (or when a jar / `beforeRedirect` is used), follow redirects in-library. Cap is 20 if unset in that mode. `0` returns the 3xx. |
| `credentials` / `cache` / `mode` / `duplex` / … | `FetchInit` | — | Copied onto the `Request`. Streaming bodies set `duplex: 'half'` unless you override it. |
| `cancelToken` | `CancelToken` | — | Axios-style cancel handle. Aborts the `Request` and throws `HttpError` with `code: 'CANCELED'`. |
| `responseType` | `'json' \| 'stream'` | auto | `'json'` always parses the body onto `data`. `'stream'` never does (use `stream()`). Default: parse when `Content-Type` is `application/json` or `*+json`. |
| `onUploadProgress` | `(event) => void` | — | Bytes sent. `event` is `{ loaded, total, lengthComputable, percent }`. |
| `onDownloadProgress` | `(event) => void` | — | Bytes received while the response body is read. Uses `Content-Length` for `total` when present. |

#### Properties

- **`cookieJar`** — `CookieJar | undefined` used by this instance.

#### Methods

Each of `get`, `post`, `put`, `patch`, `delete`, `head`, `options` takes `(url: string, options?: RequestOptions)` and returns a `ClientPromise`.

**`request(method, url, options?)`** — any verb (`method` is uppercased).

Static methods with the same names are one-shots (`Client.get(url, options)`, `Client.request('OPTIONS', url)`).

**`extend(options: ClientOptions): Client`** — derived client. Headers and hooks are merged; an inherited jar is reused unless `cookieJar` is set.

**Request `options`** (in addition to constructor fields; per-request wins):

| Name | Type | Description |
|---|---|---|
| `query` | `unknown` | Nested object/array encoded onto the URL. |
| `body` | `unknown` | Object → JSON unless `content-type` is urlencoded. `string` / `Buffer` / `Blob` / `FormData` / `ReadableStream` / Node `Readable` pass through. |
| `form` | `Record<string, unknown>` | `application/x-www-form-urlencoded` via querystring. |
| `multipart` | `Record<string, unknown>` | `multipart/form-data` via `FormData`. |
| `signal` | `AbortSignal` | Merged with `timeout` and `cancelToken.signal`. |
| `redirect` | `RequestRedirect` | Passed to `fetch` when the library is not following redirects itself (`follow` by default). |

**Throws:** `HttpError` with `code: 'HTTP_ERROR'` on failed status (unless opted out); `'TIMEOUT'` on abort from `timeout`; `'CANCELED'` on `cancelToken` / `AbortSignal`; `'NETWORK'` on other fetch failures.

```typescript
const res = await iam.get('/missing', { throwHttpError: false });
if( !res.ok )
{
    console.log( res.status, await res.text() );
}

await iam.post('/login', { form: { user: 'ada', password: 'secret' } });
await iam.post('/upload', { multipart: { file: blob, name: 'a' } });

const sessioned = new Client({ webroot: 'https://example.com', cookieJar: true });

await iam.post('/upload', {
    body             : { n: 1 },
    onUploadProgress : ({ percent }) => console.log( percent )
});
```

### `ClientResponse`

Wraps `Response`. Body methods read the payload once and cache bytes. When `Content-Type` is JSON, `data` is filled before the promise resolves.

```typescript
const res = await iam.get( '/auth/session' );

res.data; // { user: { id: '…' } }
```

| Member | Type | Description |
|---|---|---|
| `ok` | `boolean` | `response.ok` |
| `status` | `number` | HTTP status |
| `headers` | `Headers` | Response headers |
| `url` | `string` | Final URL |
| `data` | `unknown \| undefined` | Parsed JSON when auto-parse ran or after `json()`. |
| `raw` | `Response` | Underlying `Response` |
| `json<T>()` | `Promise<T>` | Parse UTF-8 JSON |
| `text()` | `Promise<string>` | UTF-8 text |
| `buffer()` | `Promise<Uint8Array>` | Raw bytes (`Buffer` in Node) |
| `stream()` | `ReadableStream<Uint8Array>` | Web stream of the body |

### `ClientPromise`

A `Promise<ClientResponse>` with shortcuts so `await client.get(url).json<T>()` works.

### `HttpError`

Extends `Error`. `name` is `'HttpError'`.

| Property | Type | Description |
|---|---|---|
| `code` | `'HTTP_ERROR' \| 'TIMEOUT' \| 'NETWORK' \| 'CANCELED'` | Failure class |
| `status` | `number \| undefined` | Set for HTTP errors |
| `body` | `unknown` | Parsed JSON or text, when available |
| `response` | `Response \| undefined` | Original response for HTTP errors |

### `CancelToken`

Axios-compatible abort handle. Prefer this when migrating from axios; `AbortSignal` still works via `signal`.

```typescript
import { CancelToken } from '@webergency-utils/client';

const { token, cancel } = CancelToken.source();
const pending = client.get( '/slow', { cancelToken: token });

cancel( 'user aborted' );
await pending; // throws HttpError { code: 'CANCELED' }
```

- **`CancelToken.source()`** — `{ token, cancel }`.
- **`new CancelToken( executor )`** — `executor` receives `cancel(message?)`.
- **`token.signal`** — `AbortSignal` merged into the request.
- **`token.throwIfRequested()`** — throws if already canceled.

Canceled requests are not retried.

### `CookieJar`

In-memory cookie store. `Cookie` values are encoded with `encodeURIComponent` on serialize.

```typescript
import { CookieJar } from '@webergency-utils/client';

const jar = new CookieJar();
jar.set( 'https://example.com/', 'sid=abc; Path=/; Secure' );
jar.get( 'https://example.com/app' ); // 'sid=abc'
```

- **`set(url, cookie_str)`** — parse a `Set-Cookie` line in the context of `url`.
- **`storeFromResponse(url, headers)`** — ingest `headers.getSetCookie()`.
- **`get(url, initiator?)`** — `Cookie` header value for `url` (empty string if none). `initiator` is the first-party URL of the request chain; `Client` passes the original request URL on every redirect hop.
- **`cookies()`** — list stored records (`name`, `value`, `domain`, `path`, `samesite`, flags).

Domain attributes that do not match the request host are ignored. `Secure` cookies are omitted on `http:`. Expired / `deleted` / empty values are dropped.

Unspecified `SameSite` defaults to `Lax` (Chrome). `SameSite=Lax` / `Strict` cookies are sent only when the request is same-site with both the cookie's source and the `initiator` (schemeful: `http` and `https` are different sites). `SameSite=None` requires `Secure` and is sent on cross-site hops; without `Secure` the cookie is ignored.

### `Querystring`, `stringify`, `parse`, `parseCookies`

```typescript
import { stringify, parse, parseCookies, Querystring } from '@webergency-utils/client';

stringify({ foo: { bar: true }, ids: [ 1, 2 ] });
// 'foo[bar]=1&ids[0]=1&ids[1]=2'

parse( 'foo[bar]=1', { types: [ 'number', 'boolean', 'null' ] });
parseCookies( 'a=1; b=2' );
```

- **stringify** — nested objects as `key[child]`, arrays as `key[i]`, booleans as `1`/`0`, `null` as a bare key, `undefined` skipped.
- **parse** — inverse; optional `types` coerces `'1'` / `'true'` / `'null'`.
- **parseCookies** — `Cookie` header → `{ name: value }`.
- **Querystring.stringify / .parse / .parseCookies** — same functions on the class.

### `resolveUrl(webroot, path)`

Joins `webroot` with a relative `path`. Absolute `http(s)` paths are returned unchanged.

### Types

`ClientOptions`, `RequestOptions`, `ClientHooks`, `FetchInit`, `ResponseType`, `BeforeRequestHook`, `AfterResponseHook`, `BeforeRetryHook`, `BeforeErrorHook`, `BeforeRedirectHook`, `RetryOptions`, `RetryDelay`, `ProgressEvent`, `ProgressHandler`, `CancelTokenSource`, `CookieRecord`, `SameSite`, `HttpErrorCode`, `QueryParseOptions`, `QueryType`.

`RetryOptions`: `{ limit?, methods?, statusCodes?, delay?, jitter? }`. Default methods are GET/HEAD/PUT/DELETE; default status codes are 429, 502, 503, 504. `delay(attempt, retryAfter)` replaces the built-in backoff. `jitter: true` adds up to 20% extra delay; a number is that fraction.

`beforeRedirect` receives `(request, response, url, options)` and may return a new URL string or a `Request` for the next hop. It runs only when redirects are followed in-library.

## Troubleshooting

### 4xx/5xx throw even though the old client returned a response

Default is `throwHttpError: true`. Pass `throwHttpError: false` on the instance or request, then check `res.ok` / `res.status`.

### Cookies are missing after a login redirect

Pass `cookieJar: true` (or a `CookieJar`). Without a jar, `fetch` follows redirects and does not store `Set-Cookie`. Set `maxRedirects` or `beforeRedirect` to follow in-library without a jar.

Cross-site hops omit `SameSite=Lax` / `Strict` cookies. Use `SameSite=None; Secure` when the cookie must be sent to a different site. Unspecified SameSite is Lax.

### `query` did not encode nested objects as `foo[bar]=`

That encoding is intentional. `URLSearchParams` is not used. Use `stringify` / `parse` from this package if you need the same codec outside HTTP.

## Maintenance

This package is actively maintained.

Bug reports and pull requests are welcome. Security issues and critical
regressions are prioritized. New features are considered when they align
with the package's existing scope.
