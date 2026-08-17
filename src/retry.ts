export type RetryDelay = ( attempt: number, retryAfter: string | null ) => number;

export type RetryOptions =
{
    limit?       : number
    methods?     : string[]
    statusCodes? : number[]
    delay?       : RetryDelay
    jitter?      : boolean | number
}

export type NormalizedRetry =
{
    limit       : number
    methods     : Set<string>
    statusCodes : Set<number>
    delay?      : RetryDelay
    jitter      : number
}

const DEFAULT_METHODS = [ 'GET', 'HEAD', 'PUT', 'DELETE' ];
const DEFAULT_STATUS = [ 429, 502, 503, 504 ];

export function normalizeRetry( retry: number | RetryOptions | undefined ): NormalizedRetry
{
    if( typeof retry === 'number' )
    {
        return {
            limit       : retry,
            methods     : new Set( DEFAULT_METHODS ),
            statusCodes : new Set( DEFAULT_STATUS ),
            jitter      : 0
        };
    }

    const jitter = retry?.jitter === true ? 0.2 : ( typeof retry?.jitter === 'number' ? Math.max( 0, retry.jitter ) : 0 );

    return {
        limit       : retry?.limit ?? 2,
        methods     : new Set(( retry?.methods ?? DEFAULT_METHODS ).map( m => m.toUpperCase() )),
        statusCodes : new Set( retry?.statusCodes ?? DEFAULT_STATUS ),
        delay       : retry?.delay,
        jitter
    };
}

export function retryDelay( attempt: number, retryAfter: string | null ): number
{
    if( retryAfter )
    {
        const seconds = Number( retryAfter );

        if( !Number.isNaN( seconds ) ){ return Math.max( 0, seconds * 1000 ) }

        const date = Date.parse( retryAfter );

        if( !Number.isNaN( date ) ){ return Math.max( 0, date - Date.now() ) }
    }

    return Math.min( 30_000, 250 * Math.pow( 2, attempt ) );
}

export function computeRetryDelay( attempt: number, retryAfter: string | null, retry: NormalizedRetry, random = Math.random ): number
{
    const base = retry.delay ? retry.delay( attempt, retryAfter ) : retryDelay( attempt, retryAfter );

    if( retry.jitter <= 0 ){ return base }

    return Math.round( base * ( 1 + random() * retry.jitter ) );
}

export function shouldRetry( input:
{
    attempt : number
    method  : string
    retry   : NormalizedRetry
    status? : number
    error?  : unknown
}): boolean
{
    if( input.attempt >= input.retry.limit ){ return false }
    if( !input.retry.methods.has( input.method.toUpperCase() ) ){ return false }

    if( input.status !== undefined )
    {
        return input.retry.statusCodes.has( input.status );
    }

    return input.error !== undefined;
}
