const SEP = '&';
const EQ = '=';
const DEL = ';';
const INT_RE = /^[0-9]+$/;

export type QueryType = 'null' | 'undefined' | 'boolean' | 'number';

export type QueryParseOptions =
{
    types? : QueryType[]
}

type QueryRecord = Record<string | number, unknown>

function expand( data: unknown, pairs: string[] = [], prefix = '' ): string[]
{
    if( data === undefined )
    {
        return pairs;
    }

    if( data === null )
    {
        pairs.push( prefix );
    }
    else if( typeof data === 'boolean' )
    {
        pairs.push( prefix + '=' + ( data ? '1' : '0' ));
    }
    else if( typeof data === 'number' || typeof data === 'string' )
    {
        pairs.push( prefix + '=' + encodeURIComponent( data.toString() ));
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
            if( !Object.prototype.hasOwnProperty.call( data, key ) ){ continue }

            expand(
                ( data as Record<string, unknown> )[key],
                pairs,
                prefix ? prefix + '[' + key + ']' : key
            );
        }
    }

    return pairs;
}

function typedValue( value: string, types: QueryType[] = [] ): unknown
{
    if( value === 'null' && types.includes( 'null' ) ){ return null }
    if( value === 'undefined' && types.includes( 'undefined' ) ){ return undefined }
    if( [ 'true', 'false' ].includes( value ) && types.includes( 'boolean' ) ){ return value === 'true' }
    if( /^[+-]?[0-9]+$/.test( value ) && types.includes( 'number' ) ){ return parseInt( value, 10 ) }
    if( /^[+-]?([0-9]*\.[0-9]+)$/.test( value ) && types.includes( 'number' ) ){ return parseFloat( value ) }

    return value;
}

function createQuery(): QueryRecord
{
    const query: QueryRecord = {};

    Object.defineProperty( query, 'assign',
    {
        enumerable   : false,
        configurable : false,
        value        : ( key: string, value: unknown, types?: QueryType[] ) =>
        {
            const keys = key.replace( /\]\[/g, '[' ).replace( /]$/, '' ).split( '[' );
            let obj: any = query;
            let parent: any;
            let parentKey: string | number | undefined;
            let parsed = types ? typedValue( value as string, types ) : value;

            for( let i = 0; i < keys.length; ++i )
            {
                let k: string | number = keys[i];

                if( k && INT_RE.test( k ) )
                {
                    k = parseInt( keys[i], 10 );
                }
                else if( k === '' )
                {
                    k = Array.isArray( obj )
                        ? obj.length - 1
                        : Math.max( -1, ...Object.keys( obj ).map( x => INT_RE.test( x ) ? parseInt( x, 10 ) : -1 ));

                    if( k === -1 || i === keys.length - 1 || obj[k]?.hasOwnProperty?.( keys[i + 1] ) )
                    {
                        k += 1;
                    }
                }

                if( typeof k === 'string' && Array.isArray( obj ) )
                {
                    parent[parentKey!] = obj = obj.reduce(( o: Record<string, unknown>, v: unknown, idx: number ) =>
                    {
                        o[idx] = v;

                        return o;
                    }, {});
                }

                if( i < keys.length - 1 )
                {
                    if( !obj[k] )
                    {
                        obj[k] = ( keys[i + 1] === '' || INT_RE.test( keys[i + 1] )) ? [] : {};
                    }

                    parent = obj;
                    parentKey = k;
                    obj = obj[k];
                }
                else
                {
                    if( obj[k] !== undefined )
                    {
                        if( Array.isArray( obj[k] ) )
                        {
                            obj[k].push( parsed );
                        }
                        else if( typeof obj[k] === 'object' && obj[k] !== null )
                        {
                            obj[k][ Math.max( -1, ...Object.keys( obj ).map( x => INT_RE.test( x ) ? parseInt( x, 10 ) : -1 )) + 1 ] = parsed;
                        }
                        else
                        {
                            ( obj[k] = [ obj[k] ] ).push( parsed );
                        }
                    }
                    else
                    {
                        obj[k] = parsed;
                    }
                }
            }
        }
    });

    return query;
}

export function stringify( data: unknown ): string
{
    return expand( data ).join( '&' );
}

export function parse( queryString: string, options: QueryParseOptions = {} ): Record<string, unknown>
{
    const data = createQuery() as any;
    let lastPair = 0;

    do
    {
        let pair = queryString.indexOf( SEP, lastPair );

        if( pair === -1 ){ pair = queryString.length }

        if( pair - lastPair > 1 )
        {
            const value = queryString.indexOf( EQ, lastPair );

            if( value !== -1 && value < pair )
            {
                data.assign(
                    decodeURIComponent( queryString.substring( lastPair, value ).replace( /\+/g, ' ' )),
                    decodeURIComponent( queryString.substring( value + 1, pair ).replace( /\+/g, ' ' )),
                    options.types
                );
            }
            else
            {
                data.assign( decodeURIComponent( queryString.substring( lastPair, pair ).replace( /\+/g, ' ' )), null );
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

        if( pair - lastPair > 1 )
        {
            const value = cookieString.indexOf( EQ, lastPair );

            if( value !== -1 && value < pair )
            {
                const key = decodeURIComponent( cookieString.substring( lastPair, value ).trim() );
                const val = decodeURIComponent( cookieString.substring( value + 1, pair ).trim() );

                cookies[key] = val;
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
