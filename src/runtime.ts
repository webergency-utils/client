export type BufferCtor =
{
    isBuffer?( value: unknown ): boolean
    from( data: Uint8Array ): Uint8Array
}

export function getBuffer(): BufferCtor | undefined
{
    return ( globalThis as { Buffer?: BufferCtor }).Buffer;
}

export function isBuffer( value: unknown ): value is Uint8Array
{
    const BufferCtor = getBuffer();

    return !!BufferCtor && typeof BufferCtor.isBuffer === 'function' && BufferCtor.isBuffer( value );
}
