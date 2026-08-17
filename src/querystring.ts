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

function expand( data: unknown, querystring: string[] = [], prefix = '' ): string[]
{
    if( data === undefined )
    {
        return querystring;
    }

    if( data === null )
    {
        querystring.push( prefix );
    }
    else if( typeof data === 'boolean' )
    {
        querystring.push( prefix + '=' + ( data ? '1' : '0' ));
    }
    else if( typeof data === 'number' || typeof data === 'string' )
    {
        querystring.push( prefix + '=' + encodeURIComponent( data.toString() ));
    }
    else if( Array.isArray( data ))
    {
        for( let i = 0; i < data.length; ++i )
        {
            expand( data[i], querystring, prefix + '[' + i + ']' );
        }
    }
    else if( typeof data === 'object' )
    {
        for( const key in data as Record<string, unknown> )
        {
            if( !Object.prototype.hasOwnProperty.call( data, key ) ){ continue }

            expand(
                ( data as Record<string, unknown> )[key],
                querystring,
                prefix ? prefix + '[' + key + ']' : key
            );
        }
    }

    return querystring;
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
            let parent_key: string | number | undefined;
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
                    parent[parent_key!] = obj = obj.reduce(( o: Record<string, unknown>, v: unknown, idx: number ) =>
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
                    parent_key = k;
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

export function parse( querystring: string, options: QueryParseOptions = {} ): Record<string, unknown>
{
    const data = createQuery() as any;
    let last_pair = 0;

    do
    {
        let pair = querystring.indexOf( SEP, last_pair );

        if( pair === -1 ){ pair = querystring.length }

        if( pair - last_pair > 1 )
        {
            const value = querystring.indexOf( EQ, last_pair );

            if( value !== -1 && value < pair )
            {
                data.assign(
                    decodeURIComponent( querystring.substring( last_pair, value ).replace( /\+/g, ' ' )),
                    decodeURIComponent( querystring.substring( value + 1, pair ).replace( /\+/g, ' ' )),
                    options.types
                );
            }
            else
            {
                data.assign( decodeURIComponent( querystring.substring( last_pair, pair ).replace( /\+/g, ' ' )), null );
            }
        }

        last_pair = pair + 1;
    }
    while( last_pair < querystring.length );

    return data;
}

export function parseCookies( cookiestring?: string | null ): Record<string, string>
{
    const cookies: Record<string, string> = {};
    let last_pair = 0;

    if( !cookiestring ){ return cookies }

    do
    {
        let pair = cookiestring.indexOf( DEL, last_pair );

        if( pair === -1 ){ pair = cookiestring.length }

        if( pair - last_pair > 1 )
        {
            const value = cookiestring.indexOf( EQ, last_pair );

            if( value !== -1 && value < pair )
            {
                const key = decodeURIComponent( cookiestring.substring( last_pair, value ).trim() );
                const val = decodeURIComponent( cookiestring.substring( value + 1, pair ).trim() );

                cookies[key] = val;
            }
        }

        last_pair = pair + 1;
    }
    while( last_pair < cookiestring.length );

    return cookies;
}

export default class Querystring
{
    static stringify = stringify;
    static parse = parse;
    static parseCookies = parseCookies;
}
