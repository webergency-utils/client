import type CancelToken from './cancel-token';
import CookieJar from './cookie-jar';
import HttpError from './error';
import { encodeRequestBody, isStreamingBody } from './form';
import { applyDownloadProgress, applyUploadProgress, type ProgressHandler } from './progress';
import { stringify } from './querystring';
import ClientResponse from './response';
import { computeRetryDelay, normalizeRetry, shouldRetry, type RetryOptions } from './retry';

export { default as CancelToken } from './cancel-token';
export { default as CookieJar } from './cookie-jar';
export { default as HttpError } from './error';
export { default as ClientResponse } from './response';
export { default as Querystring, stringify, parse, parseCookies } from './querystring';
export type { QueryParseOptions, QueryType } from './querystring';
export type { CookieRecord, SameSite } from './cookie-jar';
export type { HttpErrorCode } from './error';
export type { RetryDelay, RetryOptions } from './retry';
export type { CancelTokenSource } from './cancel-token';
export type { ProgressEvent, ProgressHandler } from './progress';

export type BeforeRequestHook = ( request: Request, options: RequestOptions ) => Request | void | Promise<Request | void>;
export type AfterResponseHook = ( request: Request, response: Response, options: RequestOptions ) => Response | void | Promise<Response | void>;
export type BeforeRetryHook = ( request: Request, error: HttpError | undefined, attempt: number ) => void | Promise<void>;
export type BeforeErrorHook = ( error: HttpError ) => HttpError | void | Promise<HttpError | void>;
export type BeforeRedirectHook = ( request: Request, response: Response, url: string, options: RequestOptions ) => string | Request | void | Promise<string | Request | void>;

export type ClientHooks =
{
    beforeRequest?   : BeforeRequestHook[]
    afterResponse?   : AfterResponseHook[]
    beforeRetry?     : BeforeRetryHook[]
    beforeError?     : BeforeErrorHook[]
    beforeRedirect?  : BeforeRedirectHook[]
}

export type FetchInit =
{
    cache?           : RequestCache
    credentials?     : RequestCredentials
    integrity?       : string
    keepalive?       : boolean
    mode?            : RequestMode
    referrer?        : string
    referrerPolicy?  : ReferrerPolicy
    duplex?          : 'half'
    priority?        : RequestPriority
}

export type ResponseType = 'json' | 'stream'

export type ClientOptions = FetchInit &
{
    webroot?             : string
    baseURL?             : string
    headers?             : HeadersInit
    timeout?             : number
    retry?               : number | RetryOptions
    hooks?               : ClientHooks
    throwHttpError?      : boolean
    validateStatus?      : ( status: number ) => boolean
    cookieJar?           : boolean | CookieJar
    fetch?               : typeof fetch
    maxRedirects?        : number
    redirect?            : RequestRedirect
    cancelToken?         : CancelToken
    responseType?        : ResponseType
    onUploadProgress?    : ProgressHandler
    onDownloadProgress?  : ProgressHandler
}

export type RequestOptions = ClientOptions &
{
    query?      : unknown
    body?       : unknown
    form?       : Record<string, unknown>
    multipart?  : Record<string, unknown>
    signal?     : AbortSignal
}

export type ClientPromise = Promise<ClientResponse> &
{
    json   : <T = unknown>() => Promise<T>
    text   : () => Promise<string>
    buffer : () => Promise<Uint8Array>
    stream : () => Promise<ReadableStream<Uint8Array>>
}

const REDIRECT_STATUS = new Set([ 301, 302, 303, 307, 308 ]);
const DEFAULT_MAX_REDIRECTS = 20;

type RequestCtorInit = RequestInit &
{
    duplex?   : 'half'
    priority? : RequestPriority
}

function wrap( promise: Promise<ClientResponse> ): ClientPromise
{
    const p = promise as ClientPromise;

    p.json = <T = unknown>() => promise.then( r => r.json<T>() );
    p.text = () => promise.then( r => r.text() );
    p.buffer = () => promise.then( r => r.buffer() );
    p.stream = () => promise.then( r => r.stream() );

    return p;
}

function lowercaseHeaders( headers?: HeadersInit ): Record<string, string>
{
    const out: Record<string, string> = {};

    if( !headers ){ return out }

    if( headers instanceof Headers )
    {
        headers.forEach(( value, key ) => { out[key.toLowerCase()] = value });

        return out;
    }

    if( Array.isArray( headers ) )
    {
        for( const [ key, value ] of headers )
        {
            out[String( key ).toLowerCase()] = String( value );
        }

        return out;
    }

    for( const [ key, value ] of Object.entries( headers ) )
    {
        if( value === undefined ){ continue }

        out[key.toLowerCase()] = Array.isArray( value ) ? value.join( ', ' ) : String( value );
    }

    return out;
}

function mergeHeaders( base?: HeadersInit, extra?: HeadersInit ): Record<string, string>
{
    return { ...lowercaseHeaders( base ), ...lowercaseHeaders( extra ) };
}

function mergeHooks( base?: ClientHooks, extra?: ClientHooks ): ClientHooks
{
    return {
        beforeRequest   : [ ...( base?.beforeRequest ?? [] ), ...( extra?.beforeRequest ?? [] ) ],
        afterResponse   : [ ...( base?.afterResponse ?? [] ), ...( extra?.afterResponse ?? [] ) ],
        beforeRetry     : [ ...( base?.beforeRetry ?? [] ), ...( extra?.beforeRetry ?? [] ) ],
        beforeError     : [ ...( base?.beforeError ?? [] ), ...( extra?.beforeError ?? [] ) ],
        beforeRedirect  : [ ...( base?.beforeRedirect ?? [] ), ...( extra?.beforeRedirect ?? [] ) ]
    };
}

function resolveWebroot( options: ClientOptions ): string | undefined
{
    return options.webroot ?? options.baseURL;
}

export function resolveUrl( webroot: string | undefined, path: string ): string
{
    if( /^https?:\/\//i.test( path ) ){ return path }

    if( !webroot ){ return path }

    const base = ( webroot.replace( /\?.*$/, '' ).replace( /\/+$/, '' ) + '/' );

    return new URL( path.replace( /^\//, '' ), base ).toString();
}

function resolveJar( value: boolean | CookieJar | undefined, inherited?: CookieJar ): CookieJar | undefined
{
    if( value instanceof CookieJar ){ return value }
    if( value === true ){ return inherited ?? new CookieJar() }
    if( value === false ){ return undefined }

    return inherited;
}

function pick<T>( request: T | undefined, instance: T | undefined, fallback: T ): T
{
    if( request !== undefined ){ return request }
    if( instance !== undefined ){ return instance }

    return fallback;
}

function composeSignal( user?: AbortSignal, timeout?: number, cancel?: AbortSignal ): { signal?: AbortSignal, timeoutSignal?: AbortSignal, cancelSignal?: AbortSignal }
{
    const timeoutSignal = timeout ? AbortSignal.timeout( timeout ) : undefined;
    const signals = [ user, timeoutSignal, cancel ].filter( ( value ): value is AbortSignal => Boolean( value ) );

    if( signals.length > 1 && typeof AbortSignal.any === 'function' )
    {
        return { signal: AbortSignal.any( signals ), timeoutSignal, cancelSignal: cancel };
    }

    return { signal: signals[0], timeoutSignal, cancelSignal: cancel };
}

function abortError( cause: unknown, timeoutSignal?: AbortSignal, cancelSignal?: AbortSignal ): HttpError
{
    if( timeoutSignal?.aborted || ( cause instanceof Error && cause.name === 'TimeoutError' ) )
    {
        return new HttpError( 'Request timed out', { code: 'TIMEOUT', cause });
    }

    if( cancelSignal?.aborted || ( cause instanceof Error && cause.name === 'AbortError' ) )
    {
        const reason = typeof cancelSignal?.reason === 'string' ? cancelSignal.reason : undefined;

        return new HttpError( reason || 'Request canceled', { code: 'CANCELED', cause });
    }

    return new HttpError( 'Network request failed', { code: 'NETWORK', cause });
}

function isJsonContentType( headers: Headers ): boolean
{
    const type = ( headers.get( 'content-type' ) ?? '' ).split( ';' )[0].trim().toLowerCase();

    return type === 'application/json' || type.endsWith( '+json' );
}

function shouldParseJson( options: RequestOptions, response: Response ): boolean
{
    if( options.responseType === 'stream' ){ return false }

    if( options.responseType === 'json' ){ return true }

    return isJsonContentType( response.headers );
}

function statusAllowed( status: number, options: RequestOptions ): boolean
{
    if( options.validateStatus ){ return options.validateStatus( status ) }

    if( options.throwHttpError === false ){ return true }

    return status >= 200 && status < 300;
}

async function readErrorBody( response: Response ): Promise<unknown>
{
    const clone = response.clone();
    const text = await clone.text();

    if( !text ){ return undefined }

    try
    {
        return JSON.parse( text );
    }
    catch
    {
        return text;
    }
}

function sleep( ms: number ): Promise<void>
{
    return new Promise( resolve => setTimeout( resolve, ms ) );
}

function followManually( jar: CookieJar | undefined, options: RequestOptions ): boolean
{
    if( options.redirect === 'manual' || options.redirect === 'error' ){ return false }
    if( jar ){ return true }
    if(( options.hooks?.beforeRedirect?.length ?? 0 ) > 0 ){ return true }
    if( options.maxRedirects !== undefined ){ return true }

    return false;
}

function redirectMethod( method: string, status: number ): { method: string, dropBody: boolean }
{
    if( status === 303 ){ return { method: 'GET', dropBody: true } }

    if( ( status === 301 || status === 302 ) && method !== 'GET' && method !== 'HEAD' )
    {
        return { method: 'GET', dropBody: true };
    }

    return { method, dropBody: false };
}

function applyFetchInit( init: RequestCtorInit, options: RequestOptions ): void
{
    if( options.cache !== undefined ){ init.cache = options.cache }
    if( options.credentials !== undefined ){ init.credentials = options.credentials }
    if( options.integrity !== undefined ){ init.integrity = options.integrity }
    if( options.keepalive !== undefined ){ init.keepalive = options.keepalive }
    if( options.mode !== undefined ){ init.mode = options.mode }
    if( options.referrer !== undefined ){ init.referrer = options.referrer }
    if( options.referrerPolicy !== undefined ){ init.referrerPolicy = options.referrerPolicy }
    if( options.priority !== undefined ){ init.priority = options.priority }
    if( options.duplex !== undefined ){ init.duplex = options.duplex }
}

async function drain( response: Response ): Promise<void>
{
    try
    {
        await response.arrayBuffer();
    }
    catch
    {
        /* drained or empty */
    }
}

export default class Client
{
    #options : ClientOptions;
    #jar     : CookieJar | undefined;

    constructor( options: ClientOptions = {} )
    {
        this.#options = options;
        this.#jar = resolveJar( options.cookieJar );
    }

    get cookieJar(): CookieJar | undefined
    {
        return this.#jar;
    }

    extend( options: ClientOptions ): Client
    {
        const cookieJar = options.cookieJar === undefined
            ? this.#jar
            : resolveJar( options.cookieJar, options.cookieJar === true ? this.#jar : undefined );

        return new Client({
            ...this.#options,
            ...options,
            headers : mergeHeaders( this.#options.headers, options.headers ),
            hooks   : mergeHooks( this.#options.hooks, options.hooks ),
            cookieJar
        });
    }

    static request( method: string, url: string, options?: RequestOptions ){ return new Client().request( method, url, options ) }
    static get    ( url: string, options?: RequestOptions ){ return new Client().get( url, options ) }
    static post   ( url: string, options?: RequestOptions ){ return new Client().post( url, options ) }
    static put    ( url: string, options?: RequestOptions ){ return new Client().put( url, options ) }
    static patch  ( url: string, options?: RequestOptions ){ return new Client().patch( url, options ) }
    static delete ( url: string, options?: RequestOptions ){ return new Client().delete( url, options ) }
    static head   ( url: string, options?: RequestOptions ){ return new Client().head( url, options ) }
    static options( url: string, options?: RequestOptions ){ return new Client().options( url, options ) }

    request( method: string, url: string, options?: RequestOptions ){ return this.#send( method.toUpperCase(), url, options ) }
    get    ( url: string, options?: RequestOptions ){ return this.#send( 'GET', url, options ) }
    post   ( url: string, options?: RequestOptions ){ return this.#send( 'POST', url, options ) }
    put    ( url: string, options?: RequestOptions ){ return this.#send( 'PUT', url, options ) }
    patch  ( url: string, options?: RequestOptions ){ return this.#send( 'PATCH', url, options ) }
    delete ( url: string, options?: RequestOptions ){ return this.#send( 'DELETE', url, options ) }
    head   ( url: string, options?: RequestOptions ){ return this.#send( 'HEAD', url, options ) }
    options( url: string, options?: RequestOptions ){ return this.#send( 'OPTIONS', url, options ) }

    #send( method: string, url: string, options: RequestOptions = {} ): ClientPromise
    {
        return wrap( this.#dispatch( method, url, options ) );
    }

    async #dispatch( method: string, url: string, options: RequestOptions ): Promise<ClientResponse>
    {
        const merged: RequestOptions =
        {
            ...this.#options,
            ...options,
            headers        : mergeHeaders( this.#options.headers, options.headers ),
            hooks          : mergeHooks( this.#options.hooks, options.hooks ),
            throwHttpError : pick( options.throwHttpError, this.#options.throwHttpError, true ),
            timeout        : pick( options.timeout, this.#options.timeout, undefined ),
            retry          : options.retry !== undefined ? options.retry : this.#options.retry,
            validateStatus : options.validateStatus ?? this.#options.validateStatus,
            fetch          : options.fetch ?? this.#options.fetch,
            webroot        : resolveWebroot( options ) ?? resolveWebroot( this.#options ),
            maxRedirects   : options.maxRedirects ?? this.#options.maxRedirects,
            redirect       : options.redirect ?? this.#options.redirect,
            cache          : options.cache ?? this.#options.cache,
            credentials    : options.credentials ?? this.#options.credentials,
            integrity      : options.integrity ?? this.#options.integrity,
            keepalive      : options.keepalive ?? this.#options.keepalive,
            mode           : options.mode ?? this.#options.mode,
            referrer       : options.referrer ?? this.#options.referrer,
            referrerPolicy : options.referrerPolicy ?? this.#options.referrerPolicy,
            duplex         : options.duplex ?? this.#options.duplex,
            priority       : options.priority ?? this.#options.priority,
            cancelToken          : options.cancelToken ?? this.#options.cancelToken,
            responseType         : options.responseType ?? this.#options.responseType,
            onUploadProgress     : options.onUploadProgress ?? this.#options.onUploadProgress,
            onDownloadProgress   : options.onDownloadProgress ?? this.#options.onDownloadProgress
        };

        const jar = options.cookieJar !== undefined
            ? resolveJar( options.cookieJar, this.#jar )
            : this.#jar;

        const retry = normalizeRetry( merged.retry );
        const doFetch = merged.fetch ?? fetch;
        const manual = followManually( jar, merged );
        const redirectLimit = merged.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

        merged.cancelToken?.throwIfRequested();

        let currentUrl = resolveUrl( merged.webroot, url );
        let currentMethod = method;
        let encoded = encodeRequestBody({
            body      : options.body,
            form      : options.form,
            multipart : options.multipart,
            headers   : lowercaseHeaders( merged.headers )
        });
        let redirects = 0;
        let attempt = 0;
        let pending: Request | undefined;

        if( options.query )
        {
            const qs = stringify( options.query );

            if( qs )
            {
                currentUrl += ( currentUrl.includes( '?' ) ? '&' : '?' ) + qs;
            }
        }

        const originUrl = currentUrl;

        while( true )
        {
            const headers = new Headers( mergeHeaders( merged.headers, encoded.headers ) );

            if( encoded.body instanceof FormData )
            {
                headers.delete( 'content-type' );
            }

            if( jar )
            {
                const cookie = jar.get( currentUrl, originUrl );

                if( cookie ){ headers.set( 'cookie', cookie ) }
            }

            const { signal, timeoutSignal, cancelSignal } = composeSignal( merged.signal, merged.timeout, merged.cancelToken?.signal );
            let body = ( currentMethod === 'GET' || currentMethod === 'HEAD' ) ? undefined : encoded.body;

            if( body && merged.onUploadProgress )
            {
                const tracked = await applyUploadProgress( body as BodyInit, merged.onUploadProgress );

                body = tracked.body;

                if( tracked.contentType && !headers.has( 'content-type' ) )
                {
                    headers.set( 'content-type', tracked.contentType );
                }
            }

            let request: Request;

            if( pending )
            {
                request = pending;
                pending = undefined;

                if( jar )
                {
                    const cookie = jar.get( request.url, originUrl );

                    if( cookie )
                    {
                        const cookieHeaders = new Headers( request.headers );

                        cookieHeaders.set( 'cookie', cookie );
                        request = new Request( request, { headers: cookieHeaders } );
                    }
                }
            }
            else
            {
                const init: RequestCtorInit =
                {
                    method   : currentMethod,
                    headers,
                    body     : body as BodyInit | undefined,
                    signal,
                    redirect : manual ? 'manual' : ( merged.redirect ?? 'follow' )
                };

                applyFetchInit( init, merged );

                if( body && ( isStreamingBody( body ) || init.duplex || merged.onUploadProgress ) )
                {
                    init.duplex = merged.duplex ?? 'half';
                }

                request = new Request( currentUrl, init );
            }

            for( const hook of merged.hooks?.beforeRequest ?? [] )
            {
                const next = await hook( request, merged );

                if( next instanceof Request ){ request = next }
            }

            let response: Response;

            try
            {
                response = await doFetch( request );
            }
            catch( cause )
            {
                const error = abortError( cause, timeoutSignal, cancelSignal );

                if( error.code !== 'CANCELED' && shouldRetry({ attempt, method: currentMethod, retry, error }) )
                {
                    for( const hook of merged.hooks?.beforeRetry ?? [] )
                    {
                        await hook( request, error, attempt );
                    }

                    await sleep( computeRetryDelay( attempt, null, retry ) );
                    attempt += 1;

                    continue;
                }

                throw error;
            }

            if( jar )
            {
                jar.storeFromResponse( request.url, response.headers );
            }

            if( manual && REDIRECT_STATUS.has( response.status ) )
            {
                const location = response.headers.get( 'location' );

                if( location && redirects < redirectLimit )
                {
                    let nextUrl = new URL( location, request.url ).toString();
                    let override: Request | undefined;

                    for( const hook of merged.hooks?.beforeRedirect ?? [] )
                    {
                        const next = await hook( request, response, nextUrl, merged );

                        if( next instanceof Request )
                        {
                            override = next;
                            nextUrl = next.url;
                        }
                        else if( typeof next === 'string' )
                        {
                            nextUrl = next;
                        }
                    }

                    if( override )
                    {
                        pending = override;
                        currentUrl = override.url;
                        currentMethod = override.method;
                    }
                    else
                    {
                        currentUrl = nextUrl;

                        const redirected = redirectMethod( currentMethod, response.status );

                        currentMethod = redirected.method;

                        if( redirected.dropBody )
                        {
                            encoded = { body: undefined, headers: {} };
                        }
                    }

                    redirects += 1;
                    await drain( response );
                    continue;
                }

                if( location && redirectLimit > 0 && redirects >= redirectLimit )
                {
                    throw new HttpError( `Too many redirects (${redirectLimit})`, {
                        status   : response.status,
                        code     : 'HTTP_ERROR',
                        response
                    });
                }
            }

            for( const hook of merged.hooks?.afterResponse ?? [] )
            {
                const next = await hook( request, response, merged );

                if( next instanceof Response ){ response = next }
            }

            if( shouldRetry({ attempt, method: currentMethod, retry, status: response.status }) )
            {
                for( const hook of merged.hooks?.beforeRetry ?? [] )
                {
                    await hook( request, undefined, attempt );
                }

                await sleep( computeRetryDelay( attempt, response.headers.get( 'retry-after' ), retry ) );
                attempt += 1;
                await drain( response );
                continue;
            }

            if( merged.onDownloadProgress )
            {
                response = applyDownloadProgress( response, merged.onDownloadProgress );
            }

            if( !statusAllowed( response.status, merged ) )
            {
                const bodyData = await readErrorBody( response );
                let error = new HttpError( `Request failed with status ${response.status}`, {
                    status   : response.status,
                    code     : 'HTTP_ERROR',
                    body     : bodyData,
                    response
                });

                for( const hook of merged.hooks?.beforeError ?? [] )
                {
                    const next = await hook( error );

                    if( next instanceof HttpError ){ error = next }
                }

                throw error;
            }

            const res = new ClientResponse( response );

            if( shouldParseJson( merged, response ) )
            {
                await res.json();
            }

            return res;
        }
    }
}

export { Client };
