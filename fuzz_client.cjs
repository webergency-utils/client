const { FuzzedDataProvider } = require('@jazzer.js/core');
const client = require('./dist/client.cjs');

function createFuzzedInput( provider, depth = 0, maxDepth = 3 )
{
    if( depth >= maxDepth )
    {
        const kind = provider.consumeIntegralInRange( 0, 8 );

        if( kind === 0 ){ return provider.consumeString( 20 ) }
        if( kind === 1 ){ return provider.consumeNumber() }
        if( kind === 2 ){ return provider.consumeBoolean() }
        if( kind === 3 ){ return null }
        if( kind === 4 ){ return undefined }
        if( kind === 5 ){ return provider.consumeIntegralInRange( -1000, 1000 ) }
        if( kind === 6 ){ return Buffer.from( provider.consumeString( 8 ) ) }
        if( kind === 7 ){ return new Date( provider.consumeIntegralInRange( 0, 2e12 ) ) }

        return provider.consumeString( 8 );
    }

    const kind = provider.consumeIntegralInRange( 0, 3 );

    if( kind === 0 )
    {
        const n = provider.consumeIntegralInRange( 0, 4 );
        const arr = [];

        for( let i = 0; i < n; ++i )
        {
            arr.push( createFuzzedInput( provider, depth + 1, maxDepth ) );
        }

        return arr;
    }

    if( kind === 1 )
    {
        const n = provider.consumeIntegralInRange( 0, 4 );
        const obj = {};

        for( let i = 0; i < n; ++i )
        {
            obj[provider.consumeString( 8 ) || 'k'] = createFuzzedInput( provider, depth + 1, maxDepth );
        }

        return obj;
    }

    return provider.consumeString( 16 );
}

function swallow( promise )
{
    promise.then( ( res ) =>
    {
        res.json().catch( () => {} );
        res.text().catch( () => {} );
        res.buffer().catch( () => {} );
        res.stream();
    }).catch( () => {} );
}

module.exports.fuzz = function( data )
{
    try
    {
        const provider = new FuzzedDataProvider( data );
        const input = createFuzzedInput( provider );
        const qs = client.stringify( input );

        client.parse( qs );
        client.parse( provider.consumeString( 40 ), { types: [ 'number', 'boolean', 'null' ] });
        client.parseCookies( provider.consumeString( 40 ) );
        client.Querystring.stringify( input );
        client.Querystring.parse( qs );
        client.Querystring.parseCookies( provider.consumeString( 20 ) );
        client.resolveUrl( 'https://example.com/api', provider.consumeString( 12 ) );
        client.resolveUrl( provider.consumeString( 20 ), provider.consumeString( 12 ) );

        const jar = new client.CookieJar();

        jar.set( 'https://example.com/app', 'sid=' + provider.consumeString( 8 ) + '; Path=/' );
        jar.set( 'https://example.com/', provider.consumeString( 40 ) );
        jar.storeFromResponse( 'https://example.com/', new Headers({ 'set-cookie': 'a=' + provider.consumeString( 6 ) }));
        jar.get( 'https://example.com/app' );
        jar.cookies();

        new client.HttpError( provider.consumeString( 16 ), {
            code    : provider.pickValue([ 'HTTP_ERROR', 'TIMEOUT', 'NETWORK', 'CANCELED' ]),
            status  : provider.consumeIntegralInRange( 0, 599 ),
            body    : input
        });

        const wrapped = new client.ClientResponse( new Response( JSON.stringify({ ok: true }), {
            status  : 200,
            headers : { 'content-type': 'application/json' }
        }));

        wrapped.json().catch( () => {} );
        wrapped.text().catch( () => {} );
        wrapped.buffer().catch( () => {} );
        wrapped.stream();
        void wrapped.ok;
        void wrapped.status;
        void wrapped.headers;
        void wrapped.url;
        void wrapped.raw;

        const fakeFetch = async () => new Response( JSON.stringify({ ok: true }), {
            status  : 200,
            headers : { 'content-type': 'application/json', 'set-cookie': 'sid=1; Path=/' }
        });

        const { token, cancel } = client.CancelToken.source();

        cancel( provider.consumeString( 8 ) );

        try
        {
            token.throwIfRequested();
        }
        catch
        {
            /* expected */
        }

        const Client = client.Client;
        const http = new Client({
            webroot            : 'https://example.com',
            throwHttpError     : provider.consumeBoolean(),
            cookieJar          : provider.consumeBoolean(),
            fetch              : fakeFetch,
            retry              : { limit: 0, delay: () => 0, jitter: provider.consumeBoolean() },
            timeout            : provider.consumeIntegralInRange( 0, 50 ) || undefined,
            credentials        : provider.pickValue([ 'omit', 'include', 'same-origin' ]),
            maxRedirects       : provider.consumeIntegralInRange( 0, 3 ),
            onUploadProgress   : () => {},
            onDownloadProgress : () => {}
        });

        http.extend({ headers: { 'x-fuzz': '1' } });
        void http.cookieJar;

        const query = ( typeof input === 'object' && input !== null ) ? input : { q: input };
        const path = '/' + provider.consumeString( 8 );

        swallow( http.get( path, { query, fetch: fakeFetch, retry: 0 } ) );
        swallow( http.post( path, { body: input, fetch: fakeFetch, retry: 0 } ) );
        swallow( http.put( path, { form: { a: provider.consumeString( 8 ) }, fetch: fakeFetch, retry: 0 } ) );
        swallow( http.patch( path, { fetch: fakeFetch, retry: 0 } ) );
        swallow( http.delete( path, { fetch: fakeFetch, retry: 0 } ) );
        swallow( http.head( path, { fetch: fakeFetch, retry: 0 } ) );
        swallow( http.options( path, { fetch: fakeFetch, retry: 0 } ) );
        swallow( http.request( 'PATCH', path, { fetch: fakeFetch, retry: 0 } ) );
        swallow( Client.get( 'https://example.com/', { fetch: fakeFetch, retry: 0 } ) );
        swallow( Client.post( 'https://example.com/', { body: { n: 1 }, fetch: fakeFetch, retry: 0 } ) );
        swallow( Client.options( 'https://example.com/', { fetch: fakeFetch, retry: 0 } ) );
        swallow( Client.request( 'HEAD', 'https://example.com/', { fetch: fakeFetch, retry: 0 } ) );
    }
    catch( e )
    {
        if( e instanceof RangeError || e instanceof TypeError || e instanceof URIError ){ return }
        if( e && ( e.name === 'HttpError' || e.name === 'SyntaxError' ) ){ return }

        throw e;
    }
};
