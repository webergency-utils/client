/**
 * Web-API-only smoke: no node: imports. Run with node, bun, or deno after `npm run build`.
 */
import Client from '../dist/client.js';

function jsonResponse( body, init = {} )
{
    return new Response( JSON.stringify( body ), {
        status  : init.status ?? 200,
        headers : { 'content-type': 'application/json', ...( init.headers ?? {} ) }
    });
}

const fetchMock = async ( input ) =>
{
    if( input.url.endsWith( '/login' ) )
    {
        expect( input.method, 'POST' );
        expect( await input.text(), 'user=ada' );

        return jsonResponse({ ok: true });
    }

    expect( input.headers.get( 'x-test' ), '1' );

    return jsonResponse({ user: 'ada' });
};

function expect( actual, wanted )
{
    if( actual !== wanted )
    {
        throw new Error( 'smoke failed: ' + JSON.stringify( actual ) + ' !== ' + JSON.stringify( wanted ) );
    }
}

const client = new Client({
    webroot : 'https://api.example.com',
    headers : { 'x-test': '1' },
    fetch   : fetchMock
});

const session = await client.get( '/auth/session' );

expect( session.data.user, 'ada' );

await client.post( '/login', { form: { user: 'ada' } });

const blob = new Blob([ 'hi' ]);

await client.post( '/upload', {
    multipart        : { file: blob, name: 'a' },
    onUploadProgress : () => {}
});

console.log( 'runtime-smoke ok' );
