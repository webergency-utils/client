import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getBuffer } = vi.hoisted( () =>
({
    getBuffer : vi.fn( () => undefined as { isBuffer?( value: unknown ): boolean, from( data: Uint8Array ): Uint8Array } | undefined )
}));

vi.mock( '../src/runtime', () =>
({
    getBuffer,
    isBuffer : ( value: unknown ) =>
    {
        const BufferCtor = getBuffer();

        return !!BufferCtor && typeof BufferCtor.isBuffer === 'function' && BufferCtor.isBuffer( value );
    }
}));

import { encodeRequestBody } from '../src/form';
import { applyUploadProgress } from '../src/progress';
import ClientResponse from '../src/response';

describe( 'Buffer-absent runtime', () =>
{
    beforeEach( () =>
    {
        getBuffer.mockReset();
        getBuffer.mockReturnValue( undefined );
    });

    it( 'should return a Uint8Array from buffer() when Buffer is missing', async () =>
    {
        const res = new ClientResponse( new Response( 'hi' ) );
        const bytes = await res.buffer();

        expect( bytes ).toBeInstanceOf( Uint8Array );
        expect( bytes ).not.toBeInstanceOf( Buffer );
        expect( new TextDecoder().decode( bytes ) ).toBe( 'hi' );
    });

    it( 'should still pass a Uint8Array body through when Buffer is missing', async () =>
    {
        const bytes = new Uint8Array([ 1, 2 ]);

        expect( encodeRequestBody({ body: bytes, headers: {} }).body ).toBe( bytes );
        expect( encodeRequestBody({ body: Buffer.from( 'x' ), headers: {} }).body ).toBeInstanceOf( Uint8Array );

        const seen: number[] = [];
        const uploaded = await applyUploadProgress( Buffer.from( 'ab' ), ( event ) => { seen.push( event.loaded ) });

        await new Response( uploaded.body ).arrayBuffer();
        expect( seen.at( -1 ) ).toBe( 2 );
    });

    it( 'should treat a Buffer-like body as a typed array when isBuffer is missing', async () =>
    {
        getBuffer.mockReturnValue({ from: ( data ) => data });

        const seen: number[] = [];
        const result = await applyUploadProgress( new Uint8Array([ 9, 8 ]), ( event ) => { seen.push( event.loaded ) });

        await new Response( result.body ).arrayBuffer();
        expect( seen.at( -1 ) ).toBe( 2 );
    });

    it( 'should wrap bytes with a provided Buffer.from when present', async () =>
    {
        const wrapped = new Uint8Array([ 7, 7 ]);

        getBuffer.mockReturnValue({
            from     : () => wrapped,
            isBuffer : () => false
        });

        const res = new ClientResponse( new Response( 'hi' ) );

        expect( await res.buffer() ).toBe( wrapped );
    });
});
