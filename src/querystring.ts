const SEP = '&';
const EQ = '=';
const DEL = ';';
const INT_RE = /^[0-9]+$/;
const SIGNED_INT_RE = /^[+-]?[0-9]+$/;
const SIGNED_FLOAT_RE = /^[+-]?([0-9]*\.[0-9]+)$/;
const MAX_ARRAY_INDEX = 1000;

export type QueryType = 'null' | 'undefined' | 'boolean' | 'number';

export type QueryParseOptions =
    {
        types? : QueryType[]
    };

type QueryRecord = Record<string | number, unknown>;

function hasOwn( obj: unknown, key: PropertyKey ): boolean
{
    return typeof obj === 'object' && obj !== null && Object.prototype.hasOwnProperty.call( obj, key );
}

function isBlockedKey( key: string | number ): boolean
{
    return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

function isArrayIndex( key: string ): boolean
{
    return INT_RE.test( key ) && parseInt( key, 10 ) <= MAX_ARRAY_INDEX;
}

function maxNumericKey( obj: Record<string, unknown> ): number
{
    let max = -1;

    for( const key of Object.keys( obj ))
    {
        if( isArrayIndex( key ))
        {
            max = parseInt( key, 10 );
        }
    }

    return max;
}

function safeDecode( value: string ): string
{
    if( !value.includes( '%' )){ return value }

    try
    {
        return decodeURIComponent( value );
    }
    catch
    {
        return value;
    }
}

function decodeQueryPart( value: string ): string
{
    const normalized = value.includes( '+' ) ? value.replace( /\+/g, ' ' ) : value;

    return safeDecode( normalized );
}

function expand( data: unknown, pairs: string[] = [], prefix = '' ): string[]
{
    if( data === undefined )
    {
        return pairs;
    }

    if( data === null )
    {
        if( prefix ){ pairs.push( prefix ) }
    }
    else if( typeof data === 'boolean' )
    {
        if( prefix ){ pairs.push( prefix + '=' + ( data ? '1' : '0' )) }
    }
    else if( typeof data === 'number' )
    {
        if( prefix ){ pairs.push( prefix + '=' + data ) }
    }
    else if( typeof data === 'string' )
    {
        if( prefix ){ pairs.push( prefix + '=' + encodeURIComponent( data )) }
    }
    else if( Array.isArray( data ))
    {
        for( let i = 0; i < data.length; ++i )
        {
            expand( data[i], pairs, prefix + '[' + i + ']' );
        }
    }
    else if( typeof data === 'object' )
    {
        for( const key in data as Record<string, unknown> )
        {
            if( !hasOwn( data, key )){ continue }

            const encodedKey = encodeURIComponent( key );

            expand(
                ( data as Record<string, unknown> )[key],
                pairs,
                prefix ? prefix + '[' + encodedKey + ']' : encodedKey
            );
        }
    }

    return pairs;
}

function typedValue( value: string, types: QueryType[] = []): unknown
{
    if( value === 'null' && types.includes( 'null' )){ return null }

    if( value === 'undefined' && types.includes( 'undefined' )){ return undefined }

    if(( value === 'true' || value === 'false' ) && types.includes( 'boolean' )){ return value === 'true' }

    if( SIGNED_INT_RE.test( value ) && types.includes( 'number' )){ return parseInt( value, 10 ) }

    if( SIGNED_FLOAT_RE.test( value ) && types.includes( 'number' )){ return parseFloat( value ) }

    return value;
}

function assignQuery( query: QueryRecord, key: string, value: unknown, types?: QueryType[]): void
{
    const keys = key.includes( '[' )
        ? key.replace( /\]\[/g, '[' ).replace( /]$/, '' ).split( '[' )
        : [ key ];

    for( const segment of keys )
    {
        if( isBlockedKey( segment )){ return }
    }

    let obj: any = query;
    let parent: any;
    let parentKey: string | number | undefined;
    const parsed = types ? typedValue( value as string, types ) : value;

    for( let i = 0; i < keys.length; ++i )
    {
        let k: string | number = keys[i];

        if( k && isArrayIndex( k ))
        {
            k = parseInt( keys[i], 10 );
        }
        else if( k === '' )
        {
            k = Array.isArray( obj )
                ? obj.length - 1
                : maxNumericKey( obj );

            if( k === -1 || i === keys.length - 1 || hasOwn( obj[k], keys[i + 1]))
            {
                k += 1;
            }
        }

        if( typeof k === 'string' && Array.isArray( obj ))
        {
            parent[parentKey!] = obj = obj.reduce(( o: Record<string, unknown>, v: unknown, idx: number ) =>
            {
                o[idx] = v;

                return o;
            }, Object.create( null ));
        }

        if( i < keys.length - 1 )
        {
            if( !hasOwn( obj, k ) || typeof obj[k] !== 'object' || obj[k] === null )
            {
                obj[k] = ( keys[i + 1] === '' || isArrayIndex( keys[i + 1])) ? [] : Object.create( null );
            }

            parent = obj;
            parentKey = k;
            obj = obj[k];
        }
        else
        {
            if( hasOwn( obj, k ) && obj[k] !== undefined )
            {
                if( Array.isArray( obj[k]))
                {
                    obj[k].push( parsed );
                }
                else if( typeof obj[k] === 'object' && obj[k] !== null )
                {
                    obj[k][ maxNumericKey( obj[k]) + 1 ] = parsed;
                }
                else
                {
                    ( obj[k] = [ obj[k] ]).push( parsed );
                }
            }
            else
            {
                obj[k] = parsed;
            }
        }
    }
}

export function stringify( data: unknown ): string
{
    return expand( data ).join( '&' );
}

export function parse( queryString: string, options: QueryParseOptions = {}): Record<string, unknown>
{
    const data: Record<string, unknown> = Object.create( null );
    let lastPair = 0;

    do
    {
        let pair = queryString.indexOf( SEP, lastPair );

        if( pair === -1 ){ pair = queryString.length }

        if( pair > lastPair )
        {
            const value = queryString.indexOf( EQ, lastPair );

            if( value !== -1 && value < pair )
            {
                if( value > lastPair )
                {
                    assignQuery(
                        data,
                        decodeQueryPart( queryString.substring( lastPair, value )),
                        decodeQueryPart( queryString.substring( value + 1, pair )),
                        options.types
                    );
                }
            }
            else
            {
                assignQuery( data, decodeQueryPart( queryString.substring( lastPair, pair )), null );
            }
        }

        lastPair = pair + 1;
    }
    while( lastPair < queryString.length );

    return data;
}

export function parseCookies( cookieString?: string | null ): Record<string, string>
{
    const cookies: Record<string, string> = {};
    let lastPair = 0;

    if( !cookieString ){ return cookies }

    do
    {
        let pair = cookieString.indexOf( DEL, lastPair );

        if( pair === -1 ){ pair = cookieString.length }

        if( pair > lastPair )
        {
            const value = cookieString.indexOf( EQ, lastPair );

            if( value !== -1 && value < pair )
            {
                const key = safeDecode( cookieString.substring( lastPair, value ).trim());
                const val = safeDecode( cookieString.substring( value + 1, pair ).trim());

                if( key && !isBlockedKey( key ))
                {
                    cookies[key] = val;
                }
            }
        }

        lastPair = pair + 1;
    }
    while( lastPair < cookieString.length );

    return cookies;
}

export default class Querystring
{
    static stringify = stringify;
    static parse = parse;
    static parseCookies = parseCookies;
}
