import { describe, it, expect, beforeEach, vi } from 'vitest';
import Client, { CancelToken, HttpError, CookieJar, resolveUrl } from '../client';

function jsonResponse( body: unknown, init: ResponseInit = {} ): Response
{
    return new Response( JSON.stringify( body ), {
        status  : init.status ?? 200,
        headers : { 'content-type': 'application/json', ...( init.headers as Record<string, string> | undefined ) }
    });
}

describe( 'Client', () =>
{
    beforeEach( () =>
    {
        vi.clearAllMocks();
    });

    it( 'should join webroot and path', () =>
    {
        expect( resolveUrl( 'https://api.example.com/v1', 'users' ) ).toBe( 'https://api.example.com/v1/users' );
        expect( resolveUrl( 'https://api.example.com/v1/', '/users' ) ).toBe( 'https://api.example.com/v1/users' );
        expect( resolveUrl( undefined, 'https://other.example/x' ) ).toBe( 'https://other.example/x' );
    });

    it( 'should GET JSON with nested query', async () =>
    {
        // Arrange
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            expect( input.url ).toBe( 'https://api.example.com/auth/session?foo[bar]=1&ids[0]=a' );

            return jsonResponse({ ok: true });
        });
        const client = new Client({ webroot: 'https://api.example.com', fetch: fetchMock as typeof fetch });

        // Act
        const session = await client.get( '/auth/session', { query: { foo: { bar: 1 }, ids: [ 'a' ] } }).json<{ ok: boolean }>();

        // Assert
        expect( session ).toEqual({ ok: true });
        expect( fetchMock ).toHaveBeenCalledOnce();
    });

    it( 'should JSON-stringify object bodies and set content-type', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            expect( input.headers.get( 'content-type' ) ).toBe( 'application/json' );
            expect( await input.text() ).toBe( '{"token":"abc"}' );

            return jsonResponse({ ok: true });
        });
        const client = new Client({ fetch: fetchMock as typeof fetch });

        await client.post( 'https://api.example.com/login', { body: { token: 'abc' } });

        expect( fetchMock ).toHaveBeenCalledOnce();
    });

    it( 'should encode form bodies as urlencoded querystrings', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            expect( input.headers.get( 'content-type' ) ).toBe( 'application/x-www-form-urlencoded' );
            expect( await input.text() ).toBe( 'user=ada&nested[pw]=1' );

            return jsonResponse({ ok: true });
        });
        const client = new Client({ fetch: fetchMock as typeof fetch });

        await client.post( 'https://api.example.com/login', { form: { user: 'ada', nested: { pw: 1 } } });

        expect( fetchMock ).toHaveBeenCalledOnce();
    });

    it( 'should encode urlencoded content-type object bodies', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            expect( await input.text() ).toBe( 'a=1' );

            return jsonResponse({ ok: true });
        });
        const client = new Client({ fetch: fetchMock as typeof fetch });

        await client.post( 'https://api.example.com/login', {
            body    : { a: 1 },
            headers : { 'content-type': 'application/x-www-form-urlencoded' }
        });

        expect( fetchMock ).toHaveBeenCalledOnce();
    });

    it( 'should send multipart FormData without a preset content-type', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            expect( input.headers.get( 'content-type' ) ).toMatch( /^multipart\/form-data/ );
            const fd = await input.formData();

            expect( fd.get( 'name' ) ).toBe( 'a' );

            return jsonResponse({ ok: true });
        });
        const client = new Client({ fetch: fetchMock as typeof fetch });

        await client.post( 'https://api.example.com/upload', { multipart: { name: 'a', file: new Blob([ 'x' ]) } });

        expect( fetchMock ).toHaveBeenCalledOnce();
    });

    it( 'should merge instance headers under request headers', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            expect( input.headers.get( 'x-requested-with' ) ).toBe( 'XMLHttpRequest' );
            expect( input.headers.get( 'authorization' ) ).toBe( 'Bearer t' );

            return jsonResponse({});
        });
        const client = new Client({
            headers : { 'X-Requested-With': 'XMLHttpRequest', authorization: 'Bearer old' },
            fetch   : fetchMock as typeof fetch
        });

        await client.get( 'https://api.example.com/x', { headers: { authorization: 'Bearer t' } });
    });

    it( 'should throw HttpError on 404 by default', async () =>
    {
        const client = new Client({
            fetch : ( async () => jsonResponse({ error: 'missing' }, { status: 404 }) ) as typeof fetch
        });

        try
        {
            await client.get( 'https://api.example.com/missing' );
            expect.fail( 'should throw' );
        }
        catch( error )
        {
            expect( error ).toBeInstanceOf( HttpError );
            expect(( error as HttpError ).status ).toBe( 404 );
            expect(( error as HttpError ).code ).toBe( 'HTTP_ERROR' );
            expect(( error as HttpError ).body ).toEqual({ error: 'missing' });
        }
    });

    it( 'should return 404 when throwHttpError is false on the instance', async () =>
    {
        const client = new Client({
            throwHttpError : false,
            fetch          : ( async () => jsonResponse({ error: 'missing' }, { status: 404 }) ) as typeof fetch
        });

        const res = await client.get( 'https://api.example.com/missing' );

        expect( res.status ).toBe( 404 );
        expect( res.ok ).toBe( false );
        expect( res.data ).toEqual({ error: 'missing' });
        expect( await res.json() ).toEqual({ error: 'missing' });
    });

    it( 'should auto-parse JSON onto data when Content-Type is application/json', async () =>
    {
        const client = new Client({
            fetch : ( async () => jsonResponse({ user: 'ada' }) ) as typeof fetch
        });

        const res = await client.get( 'https://api.example.com/me' );

        expect( res.data ).toEqual({ user: 'ada' });
        expect( await res.json() ).toBe( res.data );
    });

    it( 'should auto-parse JSON when Content-Type is a +json subtype', async () =>
    {
        const client = new Client({
            fetch : ( async () => new Response( '{"ok":true}', {
                status  : 200,
                headers : { 'content-type': 'application/ld+json; charset=utf-8' }
            }) ) as typeof fetch
        });

        const res = await client.get( 'https://api.example.com/ld' );

        expect( res.data ).toEqual({ ok: true });
    });

    it( 'should not auto-parse a non-JSON Content-Type', async () =>
    {
        const client = new Client({
            fetch : ( async () => new Response( '{"ok":true}', {
                status  : 200,
                headers : { 'content-type': 'text/plain' }
            }) ) as typeof fetch
        });

        const res = await client.get( 'https://api.example.com/plain' );

        expect( res.data ).toBeUndefined();
        expect( await res.text() ).toBe( '{"ok":true}' );
    });

    it( 'should force JSON parse when responseType is json', async () =>
    {
        const client = new Client({
            responseType : 'json',
            fetch        : ( async () => new Response( '{"ok":true}', { status: 200 }) ) as typeof fetch
        });

        const res = await client.get( 'https://api.example.com/no-type' );

        expect( res.data ).toEqual({ ok: true });
    });

    it( 'should skip auto-parse when responseType is stream', async () =>
    {
        const client = new Client({
            responseType : 'stream',
            fetch        : ( async () => jsonResponse({ ok: true }) ) as typeof fetch
        });

        const res = await client.get( 'https://api.example.com/stream' );

        expect( res.data ).toBeUndefined();
        expect( await new Response( res.stream() ).text() ).toBe( '{"ok":true}' );
    });

    it( 'should throw when forced JSON parse receives invalid JSON', async () =>
    {
        const client = new Client({
            responseType : 'json',
            fetch        : ( async () => new Response( 'not-json', { status: 200 }) ) as typeof fetch
        });

        await expect( client.get( 'https://api.example.com/bad' ) ).rejects.toThrow( SyntaxError );
    });

    it( 'should let per-request throwHttpError override the instance default', async () =>
    {
        const client = new Client({
            throwHttpError : true,
            fetch          : ( async () => jsonResponse({}, { status: 404 }) ) as typeof fetch
        });

        const res = await client.get( 'https://api.example.com/missing', { throwHttpError: false });

        expect( res.status ).toBe( 404 );
    });

    it( 'should accept 409 via validateStatus', async () =>
    {
        const client = new Client({
            fetch : ( async () => jsonResponse({ conflict: true }, { status: 409 }) ) as typeof fetch
        });

        const res = await client.post( 'https://api.example.com/items', {
            body           : { a: 1 },
            validateStatus : ( status ) => status === 200 || status === 409
        });

        expect( res.status ).toBe( 409 );
        expect( await res.json() ).toEqual({ conflict: true });
    });

    it( 'should still throw TIMEOUT when HTTP throw is opted out', async () =>
    {
        const client = new Client({
            throwHttpError : false,
            timeout        : 20,
            fetch          : (( input: RequestInfo | URL, init?: RequestInit ) =>
            {
                const signal = input instanceof Request ? input.signal : init?.signal;

                return new Promise(( _resolve, reject ) =>
                {
                    signal?.addEventListener( 'abort', () =>
                    {
                        reject( Object.assign( new Error( 'Aborted' ), { name: 'TimeoutError' }) );
                    });
                });
            }) as typeof fetch
        });

        await expect( client.get( 'https://api.example.com/slow' ) ).rejects.toMatchObject({ code: 'TIMEOUT' });
    });

    it( 'should retry GET on 503 then succeed', async () =>
    {
        let calls = 0;
        const fetchMock = vi.fn( async () =>
        {
            calls += 1;

            if( calls < 3 ){ return jsonResponse({}, { status: 503 }) }

            return jsonResponse({ ok: true });
        });
        const client = new Client({
            retry : { limit: 2 },
            fetch : fetchMock as typeof fetch
        });

        const body = await client.get( 'https://api.example.com/flaky' ).json<{ ok: boolean }>();

        expect( body ).toEqual({ ok: true });
        expect( fetchMock ).toHaveBeenCalledTimes( 3 );
    });

    it( 'should not retry POST on 503', async () =>
    {
        const fetchMock = vi.fn( async () => jsonResponse({}, { status: 503 }) );
        const client = new Client({ fetch: fetchMock as typeof fetch, throwHttpError: false });

        const res = await client.post( 'https://api.example.com/x', { body: { a: 1 } });

        expect( res.status ).toBe( 503 );
        expect( fetchMock ).toHaveBeenCalledOnce();
    });

    it( 'should run instance beforeRequest hooks', async () =>
    {
        let seen = '';
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            seen = input.headers.get( 'x-hook' ) ?? '';

            return jsonResponse({});
        });
        const client = new Client({
            fetch : fetchMock as typeof fetch,
            hooks : {
                beforeRequest : [
                    ( request ) =>
                    {
                        const headers = new Headers( request.headers );

                        headers.set( 'x-hook', 'yes' );

                        return new Request( request.url, {
                            method  : request.method,
                            headers
                        });
                    }
                ]
            }
        });

        await client.get( 'https://api.example.com/x' );

        expect( seen ).toBe( 'yes' );
        expect( fetchMock ).toHaveBeenCalledOnce();
    });

    it( 'should isolate extend() headers from the parent instance', async () =>
    {
        const fetchMock = vi.fn( async () => jsonResponse({}) );
        const parent = new Client({
            headers : { 'x-parent': 'p' },
            fetch   : fetchMock as typeof fetch
        });
        const child = parent.extend({
            headers : { 'x-child': '1' }
        });

        await child.get( 'https://api.example.com/x' );
        await parent.get( 'https://api.example.com/y' );

        const childReq = fetchMock.mock.calls[0][0] as Request;
        const parentReq = fetchMock.mock.calls[1][0] as Request;

        expect( childReq.headers.get( 'x-child' ) ).toBe( '1' );
        expect( childReq.headers.get( 'x-parent' ) ).toBe( 'p' );
        expect( parentReq.headers.get( 'x-child' ) ).toBeNull();
        expect( parentReq.headers.get( 'x-parent' ) ).toBe( 'p' );
    });

    it( 'should not send a Cookie header when no jar is configured', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            expect( input.headers.get( 'cookie' ) ).toBeNull();

            return jsonResponse({});
        });
        const client = new Client({ fetch: fetchMock as typeof fetch });

        await client.get( 'https://example.com/' );
    });

    it( 'should persist cookies across redirects when cookieJar is enabled', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            if( input.url === 'https://example.com/login' )
            {
                const headers = new Headers({ location: '/home' });

                headers.append( 'set-cookie', 'sid=abc; Path=/' );

                return new Response( null, { status: 302, headers });
            }

            expect( input.url ).toBe( 'https://example.com/home' );
            expect( input.headers.get( 'cookie' ) ).toBe( 'sid=abc' );

            return jsonResponse({ ok: true });
        });
        const client = new Client({
            cookieJar : true,
            fetch     : fetchMock as typeof fetch
        });

        const body = await client.get( 'https://example.com/login' ).json<{ ok: boolean }>();

        expect( body ).toEqual({ ok: true });
        expect( fetchMock ).toHaveBeenCalledTimes( 2 );
        expect( client.cookieJar ).toBeInstanceOf( CookieJar );
    });

    it( 'should not send Lax cookies on a cross-site redirect hop', async () =>
    {
        const jar = new CookieJar();

        jar.set( 'https://bank.com/', 'sid=secret; Path=/; SameSite=Lax; Secure' );

        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            if( input.url === 'https://evil.com/start' )
            {
                return new Response( null, {
                    status  : 302,
                    headers : { location: 'https://bank.com/transfer' }
                });
            }

            expect( input.url ).toBe( 'https://bank.com/transfer' );
            expect( input.headers.get( 'cookie' ) ).toBeNull();

            return jsonResponse({ ok: true });
        });
        const client = new Client({
            cookieJar : jar,
            fetch     : fetchMock as typeof fetch
        });

        await client.get( 'https://evil.com/start' );

        expect( fetchMock ).toHaveBeenCalledTimes( 2 );
    });

    it( 'should send SameSite=None; Secure cookies on a cross-site redirect hop', async () =>
    {
        const jar = new CookieJar();

        jar.set( 'https://idp.com/', 'sid=sso; Path=/; SameSite=None; Secure' );

        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            if( input.url === 'https://app.com/login' )
            {
                return new Response( null, {
                    status  : 302,
                    headers : { location: 'https://idp.com/auth' }
                });
            }

            expect( input.url ).toBe( 'https://idp.com/auth' );
            expect( input.headers.get( 'cookie' ) ).toBe( 'sid=sso' );

            return jsonResponse({ ok: true });
        });
        const client = new Client({
            cookieJar : jar,
            fetch     : fetchMock as typeof fetch
        });

        await client.get( 'https://app.com/login' );

        expect( fetchMock ).toHaveBeenCalledTimes( 2 );
    });

    it( 'should keep Lax cookies when a login hops away and back to the original site', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            if( input.url === 'https://app.example.com/login' )
            {
                const headers = new Headers({ location: 'https://idp.example.net/auth' });

                headers.append( 'set-cookie', 'sid=abc; Path=/; SameSite=Lax; Secure' );

                return new Response( null, { status: 302, headers });
            }

            if( input.url === 'https://idp.example.net/auth' )
            {
                expect( input.headers.get( 'cookie' ) ).toBeNull();

                return new Response( null, {
                    status  : 302,
                    headers : { location: 'https://app.example.com/home' }
                });
            }

            expect( input.url ).toBe( 'https://app.example.com/home' );
            expect( input.headers.get( 'cookie' ) ).toBe( 'sid=abc' );

            return jsonResponse({ ok: true });
        });
        const client = new Client({
            cookieJar : true,
            fetch     : fetchMock as typeof fetch
        });

        const body = await client.get( 'https://app.example.com/login' ).json<{ ok: boolean }>();

        expect( body ).toEqual({ ok: true });
        expect( fetchMock ).toHaveBeenCalledTimes( 3 );
    });

    it( 'should send Lax cookies on a same-site subdomain redirect hop', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            if( input.url === 'https://app.example.com/login' )
            {
                const headers = new Headers({ location: 'https://api.example.com/session' });

                headers.append( 'set-cookie', 'sid=abc; Path=/; Domain=example.com; SameSite=Lax; Secure' );

                return new Response( null, { status: 302, headers });
            }

            expect( input.url ).toBe( 'https://api.example.com/session' );
            expect( input.headers.get( 'cookie' ) ).toBe( 'sid=abc' );

            return jsonResponse({ ok: true });
        });
        const client = new Client({
            cookieJar : true,
            fetch     : fetchMock as typeof fetch
        });

        await client.get( 'https://app.example.com/login' );

        expect( fetchMock ).toHaveBeenCalledTimes( 2 );
    });

    it( 'should convert 303 redirects to GET and drop the body', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            if( input.url.endsWith( '/submit' ) )
            {
                expect( input.method ).toBe( 'POST' );

                const headers = new Headers({ location: '/done' });

                return new Response( null, { status: 303, headers });
            }

            expect( input.method ).toBe( 'GET' );
            expect( input.body ).toBeNull();

            return jsonResponse({ done: true });
        });
        const client = new Client({ cookieJar: true, fetch: fetchMock as typeof fetch });

        await client.post( 'https://example.com/submit', { body: { a: 1 } });

        expect( fetchMock ).toHaveBeenCalledTimes( 2 );
    });

    it( 'should support static one-shot methods', async () =>
    {
        const fetchMock = vi.fn( async () => jsonResponse({ n: 1 }) );

        const n = await Client.get( 'https://example.com/n', { fetch: fetchMock as typeof fetch }).json<{ n: number }>();

        expect( n ).toEqual({ n: 1 });
    });

    it( 'should alias baseURL as webroot', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            expect( input.url ).toBe( 'https://api.example.com/v1/ping' );

            return jsonResponse({});
        });
        const client = new Client({ baseURL: 'https://api.example.com/v1', fetch: fetchMock as typeof fetch });

        await client.get( 'ping' );
    });

    it( 'should send OPTIONS and arbitrary methods via request()', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            expect( input.method ).toBe( 'OPTIONS' );

            return jsonResponse({});
        });
        const client = new Client({ fetch: fetchMock as typeof fetch });

        await client.options( 'https://api.example.com/x' );
        await Client.request( 'options', 'https://api.example.com/x', { fetch: fetchMock as typeof fetch });

        expect( fetchMock ).toHaveBeenCalledTimes( 2 );
        expect(( fetchMock.mock.calls[1][0] as Request ).method ).toBe( 'OPTIONS' );
    });

    it( 'should pass credentials and other fetch init through to Request', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            expect( input.credentials ).toBe( 'include' );
            expect( input.cache ).toBe( 'no-store' );
            expect( input.mode ).toBe( 'cors' );

            return jsonResponse({});
        });
        const client = new Client({
            credentials : 'include',
            cache       : 'no-store',
            fetch       : fetchMock as typeof fetch
        });

        await client.get( 'https://api.example.com/x', { mode: 'cors' });
    });

    it( 'should send a Node Readable body without JSON-stringifying it', async () =>
    {
        const { Readable } = await import( 'node:stream' );
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            expect( await input.text() ).toBe( 'hello' );

            return jsonResponse({});
        });
        const client = new Client({ fetch: fetchMock as typeof fetch });

        await client.post( 'https://api.example.com/upload', { body: Readable.from([ 'hello' ]) });

        expect( fetchMock ).toHaveBeenCalledOnce();
    });

    it( 'should use a custom retry delay of zero', async () =>
    {
        let calls = 0;
        const fetchMock = vi.fn( async () =>
        {
            calls += 1;

            if( calls === 1 ){ return jsonResponse({}, { status: 503 }) }

            return jsonResponse({ ok: true });
        });
        const client = new Client({
            retry : { limit: 1, delay: () => 0 },
            fetch : fetchMock as typeof fetch
        });

        await client.get( 'https://api.example.com/flaky' );

        expect( fetchMock ).toHaveBeenCalledTimes( 2 );
    });

    it( 'should follow redirects manually when maxRedirects is set', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            if( input.url === 'https://example.com/a' )
            {
                return new Response( null, { status: 302, headers: { location: '/b' } });
            }

            expect( input.url ).toBe( 'https://example.com/b' );
            expect( input.redirect ).toBe( 'manual' );

            return jsonResponse({ ok: true });
        });
        const client = new Client({
            maxRedirects : 5,
            fetch        : fetchMock as typeof fetch
        });

        expect( await client.get( 'https://example.com/a' ).json() ).toEqual({ ok: true });
        expect( fetchMock ).toHaveBeenCalledTimes( 2 );
    });

    it( 'should return the 3xx response when maxRedirects is 0', async () =>
    {
        const fetchMock = vi.fn( async () => new Response( null, { status: 302, headers: { location: '/b' } }));
        const client = new Client({
            maxRedirects   : 0,
            throwHttpError : false,
            fetch          : fetchMock as typeof fetch
        });

        const res = await client.get( 'https://example.com/a' );

        expect( res.status ).toBe( 302 );
        expect( fetchMock ).toHaveBeenCalledOnce();
    });

    it( 'should throw when the redirect limit is exceeded', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            const next = input.url.endsWith( '/a' ) ? '/b' : '/c';

            return new Response( null, { status: 302, headers: { location: next } });
        });
        const client = new Client({
            maxRedirects : 1,
            fetch        : fetchMock as typeof fetch
        });

        await expect( client.get( 'https://example.com/a' ) ).rejects.toMatchObject({
            code    : 'HTTP_ERROR',
            message : 'Too many redirects (1)'
        });
        expect( fetchMock ).toHaveBeenCalledTimes( 2 );
    });

    it( 'should run beforeRedirect and honor a returned URL', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            if( input.url === 'https://example.com/start' )
            {
                return new Response( null, { status: 302, headers: { location: '/skip' } });
            }

            expect( input.url ).toBe( 'https://example.com/final' );

            return jsonResponse({ ok: true });
        });
        const client = new Client({
            fetch : fetchMock as typeof fetch,
            hooks : {
                beforeRedirect : [
                    ( _request, _response, url ) =>
                    {
                        expect( url ).toBe( 'https://example.com/skip' );

                        return 'https://example.com/final';
                    }
                ]
            }
        });

        expect( await client.get( 'https://example.com/start' ).json() ).toEqual({ ok: true });
    });

    it( 'should convert 301 POST to GET when following redirects', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            if( input.method === 'POST' )
            {
                return new Response( null, { status: 301, headers: { location: '/next' } });
            }

            expect( input.method ).toBe( 'GET' );
            expect( input.body ).toBeNull();

            return jsonResponse({});
        });
        const client = new Client({
            cookieJar : true,
            fetch     : fetchMock as typeof fetch
        });

        await client.post( 'https://example.com/old', { body: { a: 1 } });
    });

    it( 'should report upload progress for a JSON body', async () =>
    {
        const events: Array<{ loaded: number, total?: number }> = [];
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            expect( await input.text() ).toBe( '{"n":1}' );

            return jsonResponse({});
        });
        const client = new Client({ fetch: fetchMock as typeof fetch });

        await client.post( 'https://api.example.com/x', {
            body             : { n: 1 },
            onUploadProgress : ( event ) => { events.push({ loaded: event.loaded, total: event.total }) }
        });

        expect( events[0]?.loaded ).toBe( 0 );
        expect( events.at( -1 ) ).toMatchObject({ loaded: 7, total: 7 });
        expect( fetchMock ).toHaveBeenCalledOnce();
    });

    it( 'should report download progress from Content-Length', async () =>
    {
        const events: Array<{ loaded: number, total?: number, percent?: number }> = [];
        const fetchMock = vi.fn( async () => new Response( 'hello', {
            status  : 200,
            headers : { 'content-length': '5' }
        }));
        const client = new Client({ fetch: fetchMock as typeof fetch });

        expect( await client.get( 'https://api.example.com/x', {
            onDownloadProgress : ( event ) => { events.push({ loaded: event.loaded, total: event.total, percent: event.percent }) }
        }).text() ).toBe( 'hello' );

        expect( events[0] ).toMatchObject({ loaded: 0, total: 5 });
        expect( events.at( -1 ) ).toMatchObject({ loaded: 5, total: 5, percent: 100 });
    });

    it( 'should throw CANCELED when the token is already canceled', async () =>
    {
        const fetchMock = vi.fn( async () => jsonResponse({}));
        const { token, cancel } = CancelToken.source();

        cancel( 'stop' );

        await expect( new Client({ fetch: fetchMock as typeof fetch }).get( 'https://api.example.com/x', {
            cancelToken : token
        }) ).rejects.toMatchObject({ code: 'CANCELED', message: 'stop' });
        expect( fetchMock ).not.toHaveBeenCalled();
    });

    it( 'should throw CANCELED when cancel() aborts an in-flight request', async () =>
    {
        const { token, cancel } = CancelToken.source();
        const client = new Client({
            cancelToken : token,
            fetch       : (( input: Request ) =>
            {
                return new Promise(( _resolve, reject ) =>
                {
                    input.signal.addEventListener( 'abort', () =>
                    {
                        reject( Object.assign( new Error( 'Aborted' ), { name: 'AbortError' }) );
                    });
                    queueMicrotask( () => cancel( 'later' ) );
                });
            }) as typeof fetch
        });

        await expect( client.get( 'https://api.example.com/x' ) ).rejects.toMatchObject({ code: 'CANCELED' });
    });
});
