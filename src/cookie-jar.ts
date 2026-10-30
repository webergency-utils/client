class DefaultMap<K, V> extends Map<K, V>
{
    get( key: K, factory?: () => V ): V | undefined
    {
        if( factory && !this.has( key ))
        {
            this.set( key, factory());
        }

        return super.get( key );
    }
}

export type SameSite = 'strict' | 'lax' | 'none';

export type CookieRecord =
    {
        name      : string
        value     : string
        domain    : string
        path      : string
        secure?   : boolean
        expires?  : number
        httpOnly? : boolean
        sameSite? : SameSite
    };

type StoredCookie = CookieRecord &
{
    score       : { domain : number, path : number }
    sourceSite  : string
    sameSite    : SameSite
    hostOnly    : boolean
    cleanDomain : string
    encoded     : string
};

type PathMap = DefaultMap<string, Map<string, StoredCookie>>;
type DomainMap = DefaultMap<string, PathMap>;
type RootMap = DefaultMap<string, DomainMap>;

const MULTI_PART_TLD_RE = /^(?:co|org|gov|ac|net|edu|or|ne|com)\.[a-z]{2}$/i;
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const DOT_CHAR = 46;
const SLASH_CHAR = 47;

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

function cleanHost( domain: string ): string
{
    const lower = domain.toLowerCase();

    return lower.charCodeAt( 0 ) === DOT_CHAR ? lower.replace( /^\.+/, '' ) : lower;
}

function isPublicSuffix( domain: string ): boolean
{
    const clean = cleanHost( domain );

    if( !clean.includes( '.' )){ return true }

    return MULTI_PART_TLD_RE.test( clean );
}

function root( domain: string ): string
{
    const clean = cleanHost( domain );
    const lastDot = clean.lastIndexOf( '.' );

    if( lastDot === -1 ){ return clean }

    const secondLastDot = clean.lastIndexOf( '.', lastDot - 1 );

    if( secondLastDot === -1 ){ return clean }

    const lastTwo = clean.slice( secondLastDot + 1 );

    if( MULTI_PART_TLD_RE.test( lastTwo ))
    {
        const thirdLastDot = clean.lastIndexOf( '.', secondLastDot - 1 );

        return thirdLastDot === -1 ? clean : clean.slice( thirdLastDot + 1 );
    }

    return lastTwo;
}

function countChar( value: string, charCode: number ): number
{
    let count = 0;

    for( let i = 0; i < value.length; ++i )
    {
        if( value.charCodeAt( i ) === charCode ){ count += 1 }
    }

    return count;
}

function scoreOf( domain: string, path: string, hostOnly: boolean )
{
    return {
        domain : countChar( domain, DOT_CHAR ) + ( hostOnly ? 0.5 : 0 ),
        path   : countChar( path, SLASH_CHAR )
    };
}

function overridesCookie( cur: StoredCookie, old: StoredCookie ): boolean
{
    return cur.score.domain > old.score.domain
        || ( cur.score.domain === old.score.domain && cur.score.path > old.score.path );
}

function isIpHostname( host: string ): boolean
{
    if( host.startsWith( '[' ) || host.includes( ':' )){ return true }

    return IPV4_RE.test( host );
}

function siteKey( url: URL ): string
{
    const host = url.hostname.toLowerCase();
    const domain = isIpHostname( host ) ? host : root( host );

    return url.protocol + '//' + domain;
}

function parseSameSite( value: string ): SameSite
{
    const mode = value.toLowerCase();

    if( mode === 'none' ){ return 'none' }

    if( mode === 'strict' ){ return 'strict' }

    return 'lax';
}

function domainMatch( host: string, cookieDomain: string ): boolean
{
    const h = host.toLowerCase();
    const d = cleanHost( cookieDomain );

    return h === d || h.endsWith( '.' + d );
}

function parseOptionalUrl( raw?: string ): URL | undefined
{
    if( !raw ){ return undefined }

    try
    {
        return new URL( raw );
    }
    catch
    {
        return undefined;
    }
}

function parseSetCookie( cookieStr: string, url: URL ): StoredCookie | undefined
{
    const parts = cookieStr.split( ';' );
    const eqIdx = parts[0].indexOf( '=' );

    if( eqIdx <= 0 ){ return undefined }

    const rawName = parts[0].slice( 0, eqIdx ).trim();
    const rawValue = parts[0].slice( eqIdx + 1 ).trim();

    if( !rawName ){ return undefined }

    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.endsWith( '/' ) ? url.pathname : url.pathname + '/';
    const name = safeDecode( rawName );
    const value = safeDecode( rawValue );
    const cookie: StoredCookie =
    {
        name,
        value,
        domain      : '.' + host,
        path        : pathname,
        score       : { domain : 0, path : 0 },
        sourceSite  : siteKey( url ),
        sameSite    : 'lax',
        hostOnly    : true,
        cleanDomain : host,
        encoded     : encodeURIComponent( name ) + '=' + encodeURIComponent( value )
    };

    for( let i = 1; i < parts.length; ++i )
    {
        const attrEq = parts[i].indexOf( '=' );
        const key = ( attrEq === -1 ? parts[i] : parts[i].slice( 0, attrEq )).trim().toLowerCase();
        const val = attrEq === -1 ? '' : parts[i].slice( attrEq + 1 ).trim();

        if( key === 'domain' && val )
        {
            const normalized = cleanHost( val );

            if( normalized )
            {
                cookie.domain = '.' + normalized;
                cookie.cleanDomain = normalized;
                cookie.hostOnly = false;
            }
        }
        else if( key === 'path' && val )
        {
            cookie.path = val.endsWith( '/' ) ? val : val + '/';
        }
        else if( key === 'secure' )
        {
            cookie.secure = true;
        }
        else if( key === 'httponly' )
        {
            cookie.httpOnly = true;
        }
        else if( key === 'max-age' )
        {
            const seconds = parseInt( val, 10 );

            if( !Number.isNaN( seconds ))
            {
                cookie.expires = Date.now() + 1000 * seconds;
            }
        }
        else if( key === 'expires' )
        {
            const ts = Date.parse( val );

            if( !Number.isNaN( ts ) && cookie.expires === undefined )
            {
                cookie.expires = ts;
            }
        }
        else if( key === 'samesite' )
        {
            cookie.sameSite = parseSameSite( val );
        }
    }

    if( cookie.sameSite === 'none' && !cookie.secure ){ return undefined }

    cookie.score = scoreOf( cookie.domain, cookie.path, cookie.hostOnly );

    return cookie;
}

export default class CookieJar
{
    #domains : RootMap = new DefaultMap();

    set( url: string, cookieStr: string ): void
    {
        let parsed: URL;

        try
        {
            parsed = new URL( url );
        }
        catch
        {
            return;
        }

        const cookie = parseSetCookie( cookieStr, parsed );

        if( !cookie ){ return }

        const host = parsed.hostname.toLowerCase();

        if( !cookie.hostOnly && ( !domainMatch( host, cookie.domain ) || isPublicSuffix( cookie.domain ) || isIpHostname( host )))
        {
            cookie.domain = '.' + host;
            cookie.cleanDomain = host;
            cookie.hostOnly = true;
            cookie.score = scoreOf( cookie.domain, cookie.path, true );
        }

        const expired = cookie.expires !== undefined && cookie.expires <= Date.now();
        const deleted = !cookie.value || cookie.value === 'deleted' || expired;
        const domainKey = cookie.hostOnly ? host : cookie.domain;
        const rootMap = this.#domains.get( root( cookie.domain ), () => new DefaultMap())!;
        const domainMap = rootMap.get( domainKey, () => new DefaultMap())!;
        const pathMap = domainMap.get( cookie.path, () => new Map())!;

        if( deleted )
        {
            pathMap.delete( cookie.name );
        }
        else
        {
            pathMap.set( cookie.name, cookie );
        }
    }

    storeFromResponse( url: string, headers: Headers ): void
    {
        const list = typeof headers.getSetCookie === 'function'
            ? headers.getSetCookie()
            : [];

        for( const cookieStr of list )
        {
            this.set( url, cookieStr );
        }
    }

    get( url: string, initiator?: string, previousUrl?: string ): string
    {
        let parsed: URL;

        try
        {
            parsed = new URL( url );
        }
        catch
        {
            return '';
        }

        const host = parsed.hostname.toLowerCase();
        const hostRoot = root( host );
        const cookies = this.#domains.get( hostRoot );

        if( !cookies ){ return '' }

        const initiatorUrl = parseOptionalUrl( initiator );
        const previousParsed = parseOptionalUrl( previousUrl );
        const requestSite = parsed.protocol + '//' + ( isIpHostname( host ) ? host : hostRoot );
        const firstParty = !initiatorUrl || siteKey( initiatorUrl ) === requestSite;
        const directParty = !previousParsed || siteKey( previousParsed ) === requestSite;
        const jar = new Map<string, StoredCookie>();
        const path = ( parsed.pathname.replace( /\/+$/, '' ) || '' ) + '/';
        const now = Date.now();

        for( const [ subdomain, paths ] of cookies.entries())
        {
            if( !domainMatch( host, subdomain )){ continue }

            for( const [ cookiePath, pathCookies ] of paths.entries())
            {
                if( !path.startsWith( cookiePath )){ continue }

                for( const cookie of pathCookies.values())
                {
                    if( cookie.hostOnly && host !== cookie.cleanDomain ){ continue }

                    if( cookie.expires !== undefined && cookie.expires <= now )
                    {
                        pathCookies.delete( cookie.name );

                        continue;
                    }

                    if( cookie.secure && parsed.protocol !== 'https:' ){ continue }

                    if( cookie.sameSite !== 'none' )
                    {
                        if( cookie.sourceSite !== requestSite ){ continue }

                        if( !firstParty ){ continue }

                        if( cookie.sameSite === 'strict' && !directParty ){ continue }
                    }

                    const old = jar.get( cookie.name );

                    if( !old || overridesCookie( cookie, old ))
                    {
                        jar.set( cookie.name, cookie );
                    }
                }
            }
        }

        let result = '';

        for( const cookie of jar.values())
        {
            result = result ? result + '; ' + cookie.encoded : cookie.encoded;
        }

        return result;
    }

    cookies(): CookieRecord[]
    {
        const list: CookieRecord[] = [];

        for( const rootMap of this.#domains.values())
        {
            for( const domain of rootMap.values())
            {
                for( const path of domain.values())
                {
                    for( const cookie of path.values())
                    {
                        list.push({
                            name     : cookie.name,
                            value    : cookie.value,
                            domain   : cookie.domain,
                            path     : cookie.path,
                            secure   : cookie.secure,
                            expires  : cookie.expires,
                            httpOnly : cookie.httpOnly,
                            sameSite : cookie.sameSite
                        });
                    }
                }
            }
        }

        return list;
    }
}
