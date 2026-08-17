import { describe, it, expect, beforeEach } from 'vitest';
import { applyDownloadProgress, applyUploadProgress, progressEvent } from '../src/progress';

describe( 'progress', () =>
{
    beforeEach( () =>
    {
        /* isolation */
    });

    it( 'should compute percent only when total is positive', () =>
    {
        expect( progressEvent( 5, 10 ).percent ).toBe( 50 );
        expect( progressEvent( 5, 0 ).percent ).toBeUndefined();
        expect( progressEvent( 5 ).lengthComputable ).toBe( false );
    });

    it( 'should track upload progress for strings, buffers, and typed arrays', async () =>
    {
        const seen: number[] = [];
        const onProgress = ( event: { loaded: number } ) => { seen.push( event.loaded ) };

        const stringed = await applyUploadProgress( 'hello', onProgress );

        await new Response( stringed.body ).arrayBuffer();
        expect( seen.at( -1 ) ).toBe( 5 );

        seen.length = 0;
        const buffered = await applyUploadProgress( Buffer.from( 'ab' ), onProgress );

        await new Response( buffered.body ).arrayBuffer();
        expect( seen.at( -1 ) ).toBe( 2 );

        seen.length = 0;
        const bytes = await applyUploadProgress( new Uint8Array([ 1, 2, 3 ]), onProgress );

        await new Response( bytes.body ).arrayBuffer();
        expect( seen.at( -1 ) ).toBe( 3 );

        seen.length = 0;
        const ab = await applyUploadProgress( new Uint8Array([ 9 ]).buffer, onProgress );

        await new Response( ab.body ).arrayBuffer();
        expect( seen.at( -1 ) ).toBe( 1 );
    });

    it( 'should track upload progress for Blob and FormData and keep content-type', async () =>
    {
        const blobEvents: number[] = [];
        const blob = new Blob([ 'xyz' ], { type: 'text/plain' });
        const blobbed = await applyUploadProgress( blob, ( event ) => { blobEvents.push( event.loaded ) });

        await new Response( blobbed.body ).arrayBuffer();
        expect( blobbed.contentType?.startsWith( 'text/plain' ) ).toBe( true );
        expect( blobEvents.at( -1 ) ).toBe( 3 );

        const untyped = await applyUploadProgress( new Blob([ 'z' ]), () => {} );

        expect( untyped.contentType ).toBeUndefined();

        const fd = new FormData();

        fd.append( 'a', 'b' );

        const formed = await applyUploadProgress( fd, () => {} );

        expect( formed.contentType ).toMatch( /^multipart\/form-data/ );
        await new Response( formed.body ).arrayBuffer();
    });

    it( 'should tap a web ReadableStream and an async iterable', async () =>
    {
        const streamEvents: number[] = [];
        const source = new ReadableStream<Uint8Array>({
            start( controller )
            {
                controller.enqueue( new TextEncoder().encode( 'hi' ) );
                controller.close();
            }
        });
        const tapped = await applyUploadProgress( source, ( event ) => { streamEvents.push( event.loaded ) });

        expect( await new Response( tapped.body ).text() ).toBe( 'hi' );
        expect( streamEvents.at( -1 ) ).toBe( 2 );

        async function* chunks()
        {
            yield 'a';
            yield new Uint8Array([ 1 ]);
            yield new ArrayBuffer( 1 );
        }

        const iterableEvents: number[] = [];
        const iterated = await applyUploadProgress(
            chunks() as unknown as BodyInit,
            ( event ) => { iterableEvents.push( event.loaded ) }
        );

        expect( await new Response( iterated.body ).arrayBuffer() ).toHaveProperty( 'byteLength', 3 );
        expect( iterableEvents.at( -1 ) ).toBe( 3 );
    });

    it( 'should pass through unknown upload bodies', async () =>
    {
        const result = await applyUploadProgress( 1 as unknown as BodyInit, () => {} );

        expect( result.body ).toBe( 1 );
    });

    it( 'should report download progress and handle an empty body', async () =>
    {
        const events: Array<{ loaded: number, total?: number }> = [];
        const response = applyDownloadProgress(
            new Response( 'hello', { headers: { 'content-length': '5' } }),
            ( event ) => { events.push({ loaded: event.loaded, total: event.total }) }
        );

        expect( await response.text() ).toBe( 'hello' );
        expect( events[0] ).toMatchObject({ loaded: 0, total: 5 });
        expect( events.at( -1 ) ).toMatchObject({ loaded: 5, total: 5 });

        const emptyEvents: number[] = [];
        const empty = applyDownloadProgress(
            new Response( null ),
            ( event ) => { emptyEvents.push( event.loaded ) }
        );

        expect( empty.body ).toBeNull();
        expect( emptyEvents ).toEqual([ 0 ]);

        const noLength: number[] = [];
        const plain = applyDownloadProgress( new Response( 'ab' ), ( event ) => { noLength.push( event.loaded ) });

        expect( await plain.text() ).toBe( 'ab' );
        expect( noLength.at( -1 ) ).toBe( 2 );
    });

    it( 'should cancel a tapped download stream', async () =>
    {
        const source = new ReadableStream<Uint8Array>({
            start( controller )
            {
                controller.enqueue( new TextEncoder().encode( 'keep' ) );
            }
        });
        const response = applyDownloadProgress( new Response( source ), () => {} );
        const reader = response.body!.getReader();

        await reader.read();
        await reader.cancel( 'stop' );
    });
});
