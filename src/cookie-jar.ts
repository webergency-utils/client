class DefaultMap<K, V> extends Map<K, V>
{
    get( key: K, factory?: () => V ): V | undefined
    {
        if( factory && !this.has( key ) )
        {
            this.set( key, factory() );
        }

        return super.get( key );
    }
}

export type SameSite = 'strict' | 'lax' | 'none'

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
}

type StoredCookie = CookieRecord &
{
    score      : { domain: number, path: number }
    sourceSite : string
    sameSite   : SameSite
}

type PathMap = DefaultMap<string, Map<string, StoredCookie>>;
type DomainMap = DefaultMap<string, PathMap>;
type RootMap = DefaultMap<string, DomainMap>;

function root( domain: string ): string
{
    return domain.replace( /^.*?([^.]+\.(co\.uk|[^.]+))$/, '$1' );
}

function scoreOf( domain: string, path: string )
{
    return {
        domain : domain.replace( /[^.]/g, '' ).length,
        path   : path.replace( /[^/]/g, '' ).length
    };
}

function overridesCookie( cur: StoredCookie, old?: StoredCookie ): boolean
{
    if( !old?.score ){ return true }

    return cur.score.domain > old.score.domain
        || ( cur.score.domain === old.score.domain && cur.score.path > old.score.path );
}

function isIpHostname( host: string ): boolean
{
    if( host.startsWith( '[' ) || host.includes( ':' ) ){ return true }

    return /^(?:\d{1,3}\.){3}\d{1,3}$/.test( host );
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
    const d = cookieDomain.replace( /^\./, '' ).toLowerCase();

    return h === d || h.endsWith( '.' + d );
}

function parseSetCookie( cookieStr: string, url: URL ): StoredCookie | undefined
{
    const parts = cookieStr.split( /\s*;\s*/ );
    const first = parts[0].match( /^(?<key>[^=]*)=?(?<value>.*)$/ )!.groups!;
    const pathname = url.pathname.endsWith( '/' ) ? url.pathname : url.pathname + '/';
    const cookie: StoredCookie =
    {
        name       : decodeURIComponent( first.key ),
        value      : decodeURIComponent( first.value ),
        domain     : '.' + url.hostname,
        path       : pathname,
        score      : { domain: 0, path: 0 },
        sourceSite : siteKey( url ),
        sameSite   : 'lax'
    };

    for( let i = 1; i < parts.length; ++i )
    {
        const attr = parts[i].match( /^(?<key>[^=]*)=?(?<value>.*)$/ )!.groups!;
        const key = decodeURIComponent( attr.key ).toLowerCase();
        const val = decodeURIComponent( attr.value );

        if( key === 'domain' && val )
        {
            cookie.domain = val.startsWith( '.' ) ? val : '.' + val;
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

            if( !Number.isNaN( seconds ) )
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

    cookie.score = scoreOf( cookie.domain, cookie.path );

    return cookie;
}

export default class CookieJar
{
    #domains: RootMap = new DefaultMap();

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

        if( !domainMatch( parsed.hostname, cookie.domain ) )
        {
            cookie.domain = '.' + parsed.hostname;
            cookie.score = scoreOf( cookie.domain, cookie.path );
        }

        const expired = cookie.expires !== undefined && cookie.expires <= Date.now();
        const deleted = !cookie.value || cookie.value === 'deleted' || expired;
        const rootMap = this.#domains.get( root( cookie.domain ), () => new DefaultMap() )!;
        const domainMap = rootMap.get( cookie.domain, () => new DefaultMap() )!;
        const pathMap = domainMap.get( cookie.path, () => new Map() )!;

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

    get( url: string, initiator?: string ): string
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

        let initiatorUrl: URL | undefined;

        if( initiator )
        {
            try
            {
                initiatorUrl = new URL( initiator );
            }
            catch
            {
                initiatorUrl = undefined;
            }
        }

        const requestSite = siteKey( parsed );
        const firstParty = !initiatorUrl || siteKey( initiatorUrl ) === requestSite;
        const jar = new Map<string, StoredCookie>();
        const domain = '.' + parsed.hostname;
        const path = ( parsed.pathname.replace( /\/+$/, '' ) || '' ) + '/';
        const cookies = this.#domains.get( root( domain ));

        if( !cookies ){ return '' }

        for( const [ subdomain, paths ] of cookies.entries() )
        {
            if( !domainMatch( parsed.hostname, subdomain ) ){ continue }

            for( const [ cookiePath, pathCookies ] of paths.entries() )
            {
                if( !path.startsWith( cookiePath ) ){ continue }

                for( const cookie of pathCookies.values() )
                {
                    if( cookie.expires !== undefined && cookie.expires <= Date.now() )
                    {
                        pathCookies.delete( cookie.name );

                        continue;
                    }

                    if( cookie.secure && parsed.protocol !== 'https:' ){ continue }

                    if( cookie.sameSite !== 'none' )
                    {
                        if( cookie.sourceSite !== requestSite ){ continue }

                        if( !firstParty ){ continue }
                    }

                    const old = jar.get( cookie.name );

                    if( overridesCookie( cookie, old ) )
                    {
                        jar.set( cookie.name, cookie );
                    }
                }
            }
        }

        return [ ...jar.values() ].map( c => encodeURIComponent( c.name ) + '=' + encodeURIComponent( c.value ) ).join( '; ' );
    }

    cookies(): CookieRecord[]
    {
        const list: CookieRecord[] = [];

        for( const rootMap of this.#domains.values() )
        {
            for( const domain of rootMap.values() )
            {
                for( const path of domain.values() )
                {
                    for( const cookie of path.values() )
                    {
                        list.push({
                            name      : cookie.name,
                            value     : cookie.value,
                            domain    : cookie.domain,
                            path      : cookie.path,
                            secure    : cookie.secure,
                            expires   : cookie.expires,
                            httpOnly  : cookie.httpOnly,
                            sameSite  : cookie.sameSite
                        });
                    }
                }
            }
        }

        return list;
    }
}
