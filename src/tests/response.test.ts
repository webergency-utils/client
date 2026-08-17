import { describe, it, expect, beforeEach } from 'vitest';
import ClientResponse from '../response';

describe( 'ClientResponse', () =>
{
    beforeEach( () =>
    {
        /* isolation */
    });

    it( 'should parse JSON and text from cached bytes', async () =>
    {
        const res = new ClientResponse( new Response( '{"a":1}', {
            status  : 200,
            headers : { 'content-type': 'application/json' }
        }));

        expect( await res.json() ).toEqual({ a: 1 });
        expect( await res.text() ).toBe( '{"a":1}' );
    });

    it( 'should return undefined for empty JSON bodies', async () =>
    {
        const res = new ClientResponse( new Response( '', { status: 200 }));

        expect( await res.json() ).toBeUndefined();
    });

    it( 'should return a Uint8Array from buffer()', async () =>
    {
        const res = new ClientResponse( new Response( 'hi' ));
        const bytes = await res.buffer();

        expect( bytes ).toBeInstanceOf( Uint8Array );
        expect( new TextDecoder().decode( bytes ) ).toBe( 'hi' );
    });

    it( 'should expose a web ReadableStream from stream()', async () =>
    {
        const res = new ClientResponse( new Response( 'hi' ));
        const stream = res.stream();

        expect( stream ).toBeInstanceOf( ReadableStream );

        const text = await new Response( stream ).text();

        expect( text ).toBe( 'hi' );
    });

    it( 'should stream from the cached buffer after a body read', async () =>
    {
        const res = new ClientResponse( new Response( 'cached' ));

        await res.text();

        const text = await new Response( res.stream() ).text();

        expect( text ).toBe( 'cached' );
    });

    it( 'should set data when json() is called', async () =>
    {
        const res = new ClientResponse( new Response( '{"a":1}', {
            status  : 200,
            headers : { 'content-type': 'application/json' }
        }));

        expect( res.data ).toBeUndefined();
        expect( await res.json() ).toEqual({ a: 1 });
        expect( res.data ).toEqual({ a: 1 });
        expect( await res.json() ).toBe( res.data );
    });

    it( 'should leave data undefined for an empty JSON body after json()', async () =>
    {
        const res = new ClientResponse( new Response( '', { status: 200 }));

        expect( await res.json() ).toBeUndefined();
        expect( res.data ).toBeUndefined();
    });
});
