import { stringify } from './querystring';

export type EncodedBody =
{
    body    : BodyInit | undefined
    headers : Record<string, string>
}

function isBuffer( value: unknown ): value is Buffer
{
    return typeof Buffer !== 'undefined' && Buffer.isBuffer( value );
}

function isBlobLike( value: unknown ): value is Blob
{
    return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isFormData( value: unknown ): value is FormData
{
    return typeof FormData !== 'undefined' && value instanceof FormData;
}

function isReadableStream( value: unknown ): value is ReadableStream
{
    return typeof ReadableStream !== 'undefined' && value instanceof ReadableStream;
}

export function isNodeReadable( value: unknown ): boolean
{
    if( !value || typeof value !== 'object' ){ return false }

    const stream = value as { pipe?: unknown, read?: unknown, readable?: unknown, _readableState?: unknown };

    if( typeof stream.pipe !== 'function' ){ return false }

    return typeof stream.read === 'function' || stream.readable === true || stream._readableState !== undefined;
}

export function isStreamingBody( value: unknown ): boolean
{
    return isReadableStream( value ) || isNodeReadable( value );
}

function isUrlEncoded( headers: Record<string, string> ): boolean
{
    return ( headers['content-type'] || '' ).toLowerCase().startsWith( 'application/x-www-form-urlencoded' );
}

function toBlobPart( value: Blob | Buffer | ArrayBuffer | Uint8Array | File ): Blob
{
    if( isBlobLike( value ) ){ return value }

    return new Blob( [ value as BlobPart ] );
}

export function encodeRequestBody( input:
{
    body?      : unknown
    form?      : Record<string, unknown>
    multipart? : Record<string, unknown>
    headers    : Record<string, string>
}): EncodedBody
{
    const headers = { ...input.headers };

    if( input.multipart )
    {
        const fd = new FormData();

        for( const [ key, value ] of Object.entries( input.multipart ) )
        {
            if( value === undefined ){ continue }

            if( isBlobLike( value ) || isBuffer( value ) || value instanceof ArrayBuffer || value instanceof Uint8Array )
            {
                const blob = toBlobPart( value as Blob | Buffer | ArrayBuffer | Uint8Array );
                const filename = isBlobLike( value ) && 'name' in value ? String(( value as File ).name ) : key;

                fd.append( key, blob, filename );
            }
            else
            {
                fd.append( key, typeof value === 'string' ? value : stringifyValue( value ) );
            }
        }

        delete headers['content-type'];

        return { body: fd, headers };
    }

    if( input.form )
    {
        headers['content-type'] = 'application/x-www-form-urlencoded';

        return { body: stringify( input.form ), headers };
    }

    const body = input.body;

    if( body === undefined || body === null )
    {
        return { body: undefined, headers };
    }

    if( typeof body === 'string' || isBuffer( body ) || isBlobLike( body ) || isFormData( body ) || isReadableStream( body ) || isNodeReadable( body ) || body instanceof ArrayBuffer || body instanceof Uint8Array )
    {
        return { body: body as BodyInit, headers };
    }

    if( isUrlEncoded( headers ) )
    {
        return { body: stringify( body ), headers };
    }

    if( !headers['content-type'] )
    {
        headers['content-type'] = 'application/json';
    }

    return { body: JSON.stringify( body ), headers };
}

function stringifyValue( value: unknown ): string
{
    if( typeof value === 'string' ){ return value }
    if( typeof value === 'number' || typeof value === 'boolean' ){ return String( value ) }
    if( value === null ){ return '' }

    return JSON.stringify( value );
}
