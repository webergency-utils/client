import { describe, it, expect, beforeEach } from 'vitest';
import { encodeRequestBody, isNodeReadable, isStreamingBody } from '../src/form';

describe( 'form', () =>
{
    beforeEach( () =>
    {
        /* isolation */
    });

    it( 'should skip undefined multipart fields and stringify scalars', async () =>
    {
        const encoded = encodeRequestBody({
            multipart : {
                skip    : undefined,
                name    : 'ada',
                count   : 2,
                ok      : true,
                empty   : null,
                nested  : { a: 1 }
            },
            headers : { 'content-type': 'application/json' }
        });
        const fd = encoded.body as FormData;

        expect( encoded.headers['content-type'] ).toBeUndefined();
        expect( fd.get( 'skip' ) ).toBeNull();
        expect( fd.get( 'name' ) ).toBe( 'ada' );
        expect( fd.get( 'count' ) ).toBe( '2' );
        expect( fd.get( 'ok' ) ).toBe( 'true' );
        expect( fd.get( 'empty' ) ).toBe( '' );
        expect( fd.get( 'nested' ) ).toBe( '{"a":1}' );
    });

    it( 'should append Uint8Array and File parts onto multipart FormData', async () =>
    {
        const file = new File([ 'x' ], 'photo.bin', { type: 'application/octet-stream' });
        const encoded = encodeRequestBody({
            multipart : {
                raw  : new Uint8Array([ 1, 2 ]),
                bin  : new ArrayBuffer( 2 ),
                file
            },
            headers : {}
        });
        const fd = encoded.body as FormData;
        const uploaded = fd.get( 'file' ) as File;

        expect( fd.get( 'raw' ) ).toBeInstanceOf( Blob );
        expect( fd.get( 'bin' ) ).toBeInstanceOf( Blob );
        expect( uploaded ).toBeInstanceOf( Blob );
        expect( uploaded.name ).toBe( 'photo.bin' );
    });

    it( 'should pass FormData and Buffer bodies through', () =>
    {
        const fd = new FormData();

        fd.append( 'a', 'b' );

        expect( encodeRequestBody({ body: fd, headers: {} }).body ).toBe( fd );
        expect( encodeRequestBody({
            body    : { a: 1 },
            headers : { 'content-type': 'application/json' }
        }).body ).toBe( '{"a":1}' );
        expect( encodeRequestBody({ body: Buffer.from( 'x' ), headers: {} }).body ).toBeInstanceOf( Buffer );
        expect( encodeRequestBody({ body: null, headers: {} }).body ).toBeUndefined();
        expect( encodeRequestBody({ headers: {} }).body ).toBeUndefined();
    });

    it( 'should detect node-like streams and ignore objects without pipe', () =>
    {
        expect( isNodeReadable({ pipe: () => {}, read: () => null }) ).toBe( true );
        expect( isNodeReadable({ pipe: () => {}, readable: true }) ).toBe( true );
        expect( isNodeReadable({ pipe: () => {}, _readableState: {} }) ).toBe( true );
        expect( isNodeReadable({ pipe: () => {} }) ).toBe( false );
        expect( isNodeReadable( null ) ).toBe( false );
        expect( isStreamingBody( new ReadableStream() ) ).toBe( true );
        expect( isStreamingBody( 'no' ) ).toBe( false );
    });
});
