import { describe, it, expect, beforeEach, vi } from 'vitest';
import CookieJar from '../src/cookie-jar';

describe( 'CookieJar', () =>
{
    let jar: CookieJar;

    beforeEach(() =>
    {
        jar = new CookieJar();
    });

    it( 'should store and return a cookie for the same URL', () =>
    {
        // Arrange
        jar.set( 'https://example.com/app', 'sid=abc; Path=/' );

        // Act
        const header = jar.get( 'https://example.com/app/page' );

        // Assert
        expect( header ).toBe( 'sid=abc' );
    });

    it( 'should encode cookie values when serializing and tolerate raw percent signs', () =>
    {
        jar.set( 'https://example.com/', 'q=a b; Path=/' );
        jar.set( 'https://example.com/', 'promo=50%off; Path=/foo%bar' );

        expect( jar.get( 'https://example.com/' )).toBe( 'q=a%20b' );
        expect( jar.get( 'https://example.com/foo%bar' )).toBe( 'q=a%20b; promo=50%25off' );
    });

    it( 'should omit Secure cookies on http URLs', () =>
    {
        jar.set( 'https://example.com/', 'sid=1; Path=/; Secure' );

        expect( jar.get( 'http://example.com/' )).toBe( '' );
        expect( jar.get( 'https://example.com/' )).toBe( 'sid=1' );
    });

    it( 'should drop expired cookies', () =>
    {
        jar.set( 'https://example.com/', 'sid=1; Path=/; Max-Age=0' );

        expect( jar.get( 'https://example.com/' )).toBe( '' );
    });

    it( 'should delete cookies with empty or deleted values', () =>
    {
        jar.set( 'https://example.com/', 'sid=1; Path=/' );
        jar.set( 'https://example.com/', 'sid=deleted; Path=/' );

        expect( jar.get( 'https://example.com/' )).toBe( '' );
    });

    it( 'should ignore malformed Set-Cookie strings without an equals sign or cookie name', () =>
    {
        jar.set( 'https://example.com/', 'sid=1; Path=/' );
        jar.set( 'https://example.com/', 'sid' );
        jar.set( 'https://example.com/', '=val; Path=/' );
        jar.set( 'https://example.com/', '   =val; Path=/' );

        expect( jar.get( 'https://example.com/' )).toBe( 'sid=1' );
    });

    it( 'should ignore Domain attributes that do not match the request host or are public suffixes', () =>
    {
        jar.set( 'https://example.com/', 'sid=1; Domain=other.com; Path=/' );
        jar.set( 'https://example.com/', 'tld=1; Domain=com; Path=/' );
        jar.set( 'https://bbc.co.uk/', 'uk=1; Domain=co.uk; Path=/' );
        jar.set( 'https://127.0.0.1/', 'ip=1; Domain=127.0.0.1; Path=/' );

        expect( jar.get( 'https://example.com/' )).toBe( 'sid=1; tld=1' );
        expect( jar.get( 'https://other.com/' )).toBe( '' );
        expect( jar.get( 'https://bbc.co.uk/' )).toBe( 'uk=1' );
        expect( jar.get( 'https://other.co.uk/' )).toBe( '' );
        expect( jar.get( 'https://127.0.0.1/' )).toBe( 'ip=1' );
    });

    it( 'should keep host-only cookies restricted to the exact host while Domain cookies match subdomains', () =>
    {
        jar.set( 'https://example.com/', 'hostOnly=1; Path=/' );
        jar.set( 'https://example.com/', 'shared=1; Domain=example.com; Path=/' );

        expect( jar.get( 'https://example.com/' )).toBe( 'hostOnly=1; shared=1' );
        expect( jar.get( 'https://sub.example.com/' )).toBe( 'shared=1' );
    });

    it( 'should normalize uppercase Domain attributes and ignore dot-only Domain values', () =>
    {
        jar.set( 'https://www.example.com/', 'sid=1; Domain=Example.COM; Path=/' );
        jar.set( 'https://www.example.com/', 'dot=1; Domain=.; Path=/' );

        expect( jar.get( 'https://example.com/' )).toBe( 'sid=1' );
        expect( jar.get( 'https://www.example.com/' )).toBe( 'sid=1; dot=1' );
    });

    it( 'should isolate multi-part TLD registrable domains such as co.uk and co.jp', () =>
    {
        jar.set( 'https://a.bbc.co.uk/', 'sid=uk; Domain=bbc.co.uk; Path=/' );

        expect( jar.get( 'https://b.bbc.co.uk/' )).toBe( 'sid=uk' );
        expect( jar.get( 'https://other.co.uk/' )).toBe( '' );
    });

    it( 'should store Set-Cookie headers from a Response', () =>
    {
        const headers = new Headers();

        headers.append( 'set-cookie', 'a=1; Path=/' );
        headers.append( 'set-cookie', 'b=2; Path=/' );

        jar.storeFromResponse( 'https://example.com/', headers );

        expect( jar.get( 'https://example.com/' )).toBe( 'a=1; b=2' );

        const bare = { getSetCookie : undefined } as unknown as Headers;

        jar.storeFromResponse( 'https://example.com/', bare );
    });

    it( 'should list stored cookies without internal fields', () =>
    {
        jar.set( 'https://example.com/app', 'sid=abc; Path=/app' );

        const listed = jar.cookies();

        expect( listed ).toHaveLength( 1 );
        expect( listed[0].name ).toBe( 'sid' );
        expect( listed[0].value ).toBe( 'abc' );
        expect( listed[0].sameSite ).toBe( 'lax' );
        expect( listed[0]).not.toHaveProperty( 'score' );
        expect( listed[0]).not.toHaveProperty( 'sourceSite' );
        expect( listed[0]).not.toHaveProperty( 'hostOnly' );
    });

    it( 'should return an empty string for invalid URLs', () =>
    {
        expect( jar.get( 'not-a-url' )).toBe( '' );
    });

    it( 'should ignore set() on an invalid URL', () =>
    {
        jar.set( 'not-a-url', 'sid=1; Path=/' );

        expect( jar.cookies()).toHaveLength( 0 );
    });

    it( 'should store HttpOnly, Expires, and ignore a non-numeric Max-Age', () =>
    {
        jar.set( 'https://example.com/', 'sid=1; Path=/; HttpOnly; Max-Age=nope; Expires=Thu, 01 Jan 2099 00:00:00 GMT; Priority=High' );

        expect( jar.cookies()[0].httpOnly ).toBe( true );
        expect( jar.cookies()[0].expires ).toBeGreaterThan( Date.now());
        expect( jar.get( 'https://example.com/' )).toBe( 'sid=1' );

        jar.set( 'https://example.com/', 'other=1; Path=/; Expires=not-a-date' );

        expect( jar.cookies().find( c => c.name === 'other' )?.expires ).toBeUndefined();
    });

    it( 'should drop a cookie on get after Expires has passed', () =>
    {
        vi.useFakeTimers();
        vi.setSystemTime( new Date( '2020-01-01T00:00:00Z' ));

        jar.set( 'https://example.com/', 'sid=1; Path=/; Expires=Thu, 02 Jan 2020 00:00:00 GMT' );

        expect( jar.get( 'https://example.com/' )).toBe( 'sid=1' );

        vi.setSystemTime( new Date( '2020-01-03T00:00:00Z' ));

        expect( jar.get( 'https://example.com/' )).toBe( '' );

        vi.useRealTimers();
    });

    it( 'should prefer the more specific domain when names collide', () =>
    {
        jar.set( 'https://www.example.com/', 'sid=root; Path=/; Domain=example.com' );
        jar.set( 'https://www.example.com/', 'sid=host; Path=/' );

        expect( jar.get( 'https://www.example.com/' )).toBe( 'sid=host' );
    });

    it( 'should prefer the more specific path when names collide', () =>
    {
        jar.set( 'https://example.com/', 'sid=wide; Path=/' );
        jar.set( 'https://example.com/app', 'sid=narrow; Path=/app' );

        expect( jar.get( 'https://example.com/app/' )).toBe( 'sid=narrow' );
    });

    it( 'should keep a host cookie when a later Domain cookie is less specific', () =>
    {
        jar.set( 'https://www.example.com/', 'sid=host; Path=/' );
        jar.set( 'https://www.example.com/', 'sid=root; Path=/; Domain=example.com' );

        expect( jar.get( 'https://www.example.com/' )).toBe( 'sid=host' );
    });

    it( 'should honor a Domain attribute that already has a leading dot', () =>
    {
        jar.set( 'https://www.example.com/', 'sid=1; Path=/; Domain=.example.com' );

        expect( jar.get( 'https://www.example.com/' )).toBe( 'sid=1' );
        expect( jar.get( 'https://other.example.com/' )).toBe( 'sid=1' );
    });

    it( 'should ignore Expires when Max-Age already set the lifetime', () =>
    {
        jar.set( 'https://example.com/', 'sid=1; Path=/; Max-Age=100; Expires=Thu, 01 Jan 1970 00:00:00 GMT' );

        expect( jar.cookies()[0].expires ).toBeGreaterThan( Date.now());
        expect( jar.get( 'https://example.com/' )).toBe( 'sid=1' );
    });

    it( 'should not send a cookie whose path does not prefix the request', () =>
    {
        jar.set( 'https://example.com/app', 'sid=1; Path=/app' );

        expect( jar.get( 'https://example.com/' )).toBe( '' );
        expect( jar.get( 'https://example.com/app/x' )).toBe( 'sid=1' );
    });

    it( 'should skip a sibling host stored under the same registrable domain', () =>
    {
        jar.set( 'https://a.example.com/', 'sid=1; Path=/' );

        expect( jar.get( 'https://b.example.com/' )).toBe( '' );
        expect( jar.get( 'https://a.example.com/' )).toBe( 'sid=1' );
    });

    it( 'should treat IPv6 hosts as their own site', () =>
    {
        jar.set( 'http://[::1]/', 'sid=1; Path=/; SameSite=Lax' );

        expect( jar.get( 'http://[::1]/' )).toBe( 'sid=1' );
        expect( jar.get( 'https://[::1]/' )).toBe( '' );
    });

    describe( 'SameSite', () =>
    {
        it( 'should default an omitted SameSite attribute to Lax', () =>
        {
            jar.set( 'https://example.com/', 'sid=abc; Path=/' );

            expect( jar.cookies()[0].sameSite ).toBe( 'lax' );
            expect( jar.get( 'https://example.com/' )).toBe( 'sid=abc' );
        });

        it( 'should parse SameSite values case-insensitively', () =>
        {
            jar.set( 'https://a.example.com/', 'strict=1; Path=/; SameSite=STRICT' );
            jar.set( 'https://a.example.com/', 'lax=1; Path=/; SameSite=Lax' );
            jar.set( 'https://a.example.com/', 'none=1; Path=/; SameSite=None; Secure' );

            const modes = jar.cookies().map( c => [ c.name, c.sameSite ]);

            expect( modes ).toEqual( expect.arrayContaining([
                [ 'strict', 'strict' ],
                [ 'lax', 'lax' ],
                [ 'none', 'none' ]
            ]));
        });

        it( 'should treat an invalid SameSite value as Lax', () =>
        {
            jar.set( 'https://example.com/', 'sid=1; Path=/; SameSite=weird' );

            expect( jar.cookies()[0].sameSite ).toBe( 'lax' );
        });

        it( 'should reject SameSite=None without Secure', () =>
        {
            jar.set( 'https://example.com/', 'sid=1; Path=/; SameSite=None' );

            expect( jar.cookies()).toHaveLength( 0 );
            expect( jar.get( 'https://example.com/' )).toBe( '' );
        });

        it( 'should store SameSite=None when Secure is present', () =>
        {
            jar.set( 'https://example.com/', 'sid=1; Path=/; SameSite=None; Secure' );

            expect( jar.cookies()[0].sameSite ).toBe( 'none' );
            expect( jar.get( 'https://example.com/' )).toBe( 'sid=1' );
        });

        it( 'should send Lax and Strict cookies on a same-site subdomain hop', () =>
        {
            jar.set( 'https://login.example.com/', 'lax=1; Path=/; Domain=example.com; SameSite=Lax; Secure' );
            jar.set( 'https://login.example.com/', 'strict=1; Path=/; Domain=example.com; SameSite=Strict; Secure' );

            expect( jar.get( 'https://app.example.com/' )).toBe( 'lax=1; strict=1' );
        });

        it( 'should omit Strict cookies when the previous redirect hop is cross-site while keeping Lax', () =>
        {
            jar.set( 'https://app.example.com/', 'lax=1; Path=/; SameSite=Lax; Secure' );
            jar.set( 'https://app.example.com/', 'strict=1; Path=/; SameSite=Strict; Secure' );

            expect( jar.get( 'https://app.example.com/home', 'https://app.example.com/login', 'https://idp.example.net/auth' )).toBe( 'lax=1' );
        });

        it( 'should send SameSite=None cookies on a same-site subdomain hop', () =>
        {
            jar.set( 'https://login.example.com/', 'sid=1; Path=/; Domain=example.com; SameSite=None; Secure' );

            expect( jar.get( 'https://app.example.com/' )).toBe( 'sid=1' );
        });

        it( 'should not send Lax cookies when the initiator is cross-site', () =>
        {
            jar.set( 'https://bank.com/', 'sid=secret; Path=/; SameSite=Lax; Secure' );

            expect( jar.get( 'https://bank.com/transfer', 'https://evil.com/' )).toBe( '' );
        });

        it( 'should not send Strict cookies when the initiator is cross-site', () =>
        {
            jar.set( 'https://bank.com/', 'sid=secret; Path=/; SameSite=Strict; Secure' );

            expect( jar.get( 'https://bank.com/transfer', 'https://evil.com/' )).toBe( '' );
        });

        it( 'should send SameSite=None; Secure cookies when the initiator is cross-site', () =>
        {
            jar.set( 'https://bank.com/', 'sid=secret; Path=/; SameSite=None; Secure' );

            expect( jar.get( 'https://bank.com/transfer', 'https://evil.com/' )).toBe( 'sid=secret' );
        });

        it( 'should not send default (Lax) cookies when the initiator is cross-site', () =>
        {
            jar.set( 'https://bank.com/', 'sid=secret; Path=/; Secure' );

            expect( jar.get( 'https://bank.com/', 'https://evil.com/' )).toBe( '' );
        });

        it( 'should send Lax cookies when the initiator is the same site', () =>
        {
            jar.set( 'https://app.example.com/', 'sid=1; Path=/; Domain=example.com; SameSite=Lax; Secure' );

            expect( jar.get( 'https://api.example.com/', 'https://app.example.com/login' )).toBe( 'sid=1' );
        });

        it( 'should treat omitted initiator as a first-party request', () =>
        {
            jar.set( 'https://bank.com/', 'sid=1; Path=/; SameSite=Lax; Secure' );

            expect( jar.get( 'https://bank.com/' )).toBe( 'sid=1' );
        });

        it( 'should not send Lax cookies across http and https of the same host', () =>
        {
            jar.set( 'http://example.com/', 'sid=1; Path=/; SameSite=Lax' );

            expect( jar.get( 'https://example.com/' )).toBe( '' );
            expect( jar.get( 'http://example.com/' )).toBe( 'sid=1' );
        });

        it( 'should not send Strict cookies across http and https of the same host', () =>
        {
            jar.set( 'http://example.com/', 'sid=1; Path=/; SameSite=Strict' );

            expect( jar.get( 'https://example.com/' )).toBe( '' );
        });

        it( 'should still omit Secure cookies on http even when SameSite is None', () =>
        {
            jar.set( 'https://example.com/', 'sid=1; Path=/; SameSite=None; Secure' );

            expect( jar.get( 'http://example.com/', 'https://evil.com/' )).toBe( '' );
        });

        it( 'should send only None cookies when Lax and None are both stored and the initiator is cross-site', () =>
        {
            jar.set( 'https://bank.com/', 'lax=1; Path=/; SameSite=Lax; Secure' );
            jar.set( 'https://bank.com/', 'none=1; Path=/; SameSite=None; Secure' );

            expect( jar.get( 'https://bank.com/', 'https://evil.com/' )).toBe( 'none=1' );
        });

        it( 'should treat localhost http and https as different sites', () =>
        {
            jar.set( 'http://localhost:3000/', 'sid=1; Path=/; SameSite=Lax' );

            expect( jar.get( 'https://localhost:3000/' )).toBe( '' );
            expect( jar.get( 'http://localhost:8080/' )).toBe( 'sid=1' );
        });

        it( 'should treat an invalid initiator as first-party', () =>
        {
            jar.set( 'https://example.com/', 'sid=1; Path=/; SameSite=Lax; Secure' );

            expect( jar.get( 'https://example.com/', 'not-a-url' )).toBe( 'sid=1' );
        });

        it( 'should ignore a SameSite=None; Secure cookie whose Domain does not match the request', () =>
        {
            jar.set( 'https://bank.com/', 'sid=1; Path=/; SameSite=None; Secure' );

            expect( jar.get( 'https://evil.com/', 'https://evil.com/' )).toBe( '' );
        });
    });
});
