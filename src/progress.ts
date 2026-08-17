import { isBuffer } from './runtime';

export type ProgressEvent =
{
    loaded           : number
    total            : number | undefined
    lengthComputable : boolean
    percent          : number | undefined
}

export type ProgressHandler = ( event: ProgressEvent ) => void;

const CHUNK = 64 * 1024;

function mediaType( type: string ): string | undefined
{
    return type || undefined;
}

export function progressEvent( loaded: number, total?: number ): ProgressEvent
{
    return {
        loaded,
        total,
        lengthComputable : total !== undefined && total >= 0,
        percent          : total ? Math.min( 100, ( loaded / total ) * 100 ) : undefined
    };
}

function toUint8Array( value: ArrayBuffer | Uint8Array | Buffer ): Uint8Array
{
    if( value instanceof Uint8Array ){ return value }

    return new Uint8Array( value );
}

function streamFromBytes( bytes: Uint8Array, onProgress: ProgressHandler ): ReadableStream<Uint8Array>
{
    let offset = 0;

    return new ReadableStream({
        start()
        {
            onProgress( progressEvent( 0, bytes.byteLength ) );
        },
        pull( controller )
        {
            if( offset >= bytes.byteLength )
            {
                onProgress( progressEvent( bytes.byteLength, bytes.byteLength ) );
                controller.close();

                return;
            }

            const end = Math.min( offset + CHUNK, bytes.byteLength );

            controller.enqueue( bytes.subarray( offset, end ) );
            offset = end;
            onProgress( progressEvent( offset, bytes.byteLength ) );
        }
    });
}

function tapWebStream( stream: ReadableStream<Uint8Array>, onProgress: ProgressHandler, total?: number ): ReadableStream<Uint8Array>
{
    let loaded = 0;
    const reader = stream.getReader();

    onProgress( progressEvent( 0, total ) );

    return new ReadableStream({
        async pull( controller )
        {
            const { value, done } = await reader.read();

            if( done )
            {
                onProgress( progressEvent( loaded, total ?? loaded ) );
                controller.close();

                return;
            }

            loaded += value.byteLength;
            onProgress( progressEvent( loaded, total ) );
            controller.enqueue( value );
        },
        cancel( reason )
        {
            return reader.cancel( reason );
        }
    });
}

async function tapAsyncIterable( iterable: AsyncIterable<unknown>, onProgress: ProgressHandler ): Promise<ReadableStream<Uint8Array>>
{
    const iterator = iterable[Symbol.asyncIterator]();
    let loaded = 0;

    onProgress( progressEvent( 0 ) );

    return new ReadableStream({
        async pull( controller )
        {
            const { value, done } = await iterator.next();

            if( done )
            {
                onProgress( progressEvent( loaded, loaded ) );
                controller.close();

                return;
            }

            const chunk = typeof value === 'string' ? new TextEncoder().encode( value ) : toUint8Array( value as ArrayBuffer | Uint8Array );
            loaded += chunk.byteLength;
            onProgress( progressEvent( loaded ) );
            controller.enqueue( chunk );
        }
    });
}

export async function applyUploadProgress( body: BodyInit, onProgress: ProgressHandler ): Promise<{ body: BodyInit, contentType?: string }>
{
    if( typeof body === 'string' )
    {
        return { body: streamFromBytes( new TextEncoder().encode( body ), onProgress ) };
    }

    if( isBuffer( body ) )
    {
        return { body: streamFromBytes( body, onProgress ) };
    }

    if( body instanceof Uint8Array )
    {
        return { body: streamFromBytes( body, onProgress ) };
    }

    if( body instanceof ArrayBuffer )
    {
        return { body: streamFromBytes( new Uint8Array( body ), onProgress ) };
    }

    if( typeof Blob !== 'undefined' && body instanceof Blob )
    {
        return { body: streamFromBytes( new Uint8Array( await body.arrayBuffer() ), onProgress ), contentType: mediaType( body.type ) };
    }

    if( typeof FormData !== 'undefined' && body instanceof FormData )
    {
        const blob = await new Response( body ).blob();

        return { body: streamFromBytes( new Uint8Array( await blob.arrayBuffer() ), onProgress ), contentType: mediaType( blob.type ) };
    }

    if( typeof ReadableStream !== 'undefined' && body instanceof ReadableStream )
    {
        return { body: tapWebStream( body as ReadableStream<Uint8Array>, onProgress ) };
    }

    if( body && typeof ( body as unknown as { [Symbol.asyncIterator]?: unknown } )[Symbol.asyncIterator] === 'function' )
    {
        return { body: await tapAsyncIterable( body as unknown as AsyncIterable<unknown>, onProgress ) };
    }

    return { body };
}

export function applyDownloadProgress( response: Response, onProgress: ProgressHandler ): Response
{
    const body = response.body;

    if( !body )
    {
        onProgress( progressEvent( 0, 0 ) );

        return response;
    }

    const raw = response.headers.get( 'content-length' );
    const total = raw && /^\d+$/.test( raw ) ? Number( raw ) : undefined;

    return new Response( tapWebStream( body, onProgress, total ), {
        status     : response.status,
        statusText : response.statusText,
        headers    : response.headers
    });
}
