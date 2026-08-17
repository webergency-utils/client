/** @vitest-environment happy-dom */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Client from '../src/client';

describe( 'Client in a browser-like environment', () =>
{
    beforeEach( () =>
    {
        vi.clearAllMocks();
    });

    it( 'should GET JSON and POST FormData using Web APIs', async () =>
    {
        const fetchMock = vi.fn( async ( input: Request ) =>
        {
            if( input.url.endsWith( '/login' ) )
            {
                expect( input.method ).toBe( 'POST' );
                expect( input.headers.get( 'content-type' ) ).toBe( 'application/x-www-form-urlencoded' );
                expect( await input.text() ).toBe( 'user=ada' );

                return new Response( JSON.stringify({ ok: true }), {
                    status  : 200,
                    headers : { 'content-type': 'application/json' }
                });
            }

            return new Response( JSON.stringify({ user: 'ada' }), {
                status  : 200,
                headers : { 'content-type': 'application/json' }
            });
        });
        const client = new Client({
            webroot : 'https://api.example.com',
            fetch   : fetchMock as typeof fetch
        });

        expect(( await client.get( '/session' ) ).data ).toEqual({ user: 'ada' });

        await client.post( '/login', { form: { user: 'ada' } });

        const blob = new Blob([ 'hi' ]);

        await client.post( '/upload', {
            multipart        : { file: blob, name: 'a' },
            onUploadProgress : () => {}
        });

        expect( fetchMock ).toHaveBeenCalledTimes( 3 );
    });
});
