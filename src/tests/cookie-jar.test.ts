import { describe, it, expect, beforeEach } from 'vitest';
import CookieJar from '../cookie-jar';

describe( 'CookieJar', () =>
{
    let jar: CookieJar;

    beforeEach( () =>
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

    it( 'should encode cookie values when serializing', () =>
    {
        jar.set( 'https://example.com/', 'q=a b; Path=/' );

        expect( jar.get( 'https://example.com/' ) ).toBe( 'q=a%20b' );
    });

    it( 'should omit Secure cookies on http URLs', () =>
    {
        jar.set( 'https://example.com/', 'sid=1; Path=/; Secure' );

        expect( jar.get( 'http://example.com/' ) ).toBe( '' );
        expect( jar.get( 'https://example.com/' ) ).toBe( 'sid=1' );
    });

    it( 'should drop expired cookies', () =>
    {
        jar.set( 'https://example.com/', 'sid=1; Path=/; Max-Age=0' );

        expect( jar.get( 'https://example.com/' ) ).toBe( '' );
    });

    it( 'should delete cookies with empty or deleted values', () =>
    {
        jar.set( 'https://example.com/', 'sid=1; Path=/' );
        jar.set( 'https://example.com/', 'sid=deleted; Path=/' );

        expect( jar.get( 'https://example.com/' ) ).toBe( '' );
    });

    it( 'should ignore Domain attributes that do not match the request host', () =>
    {
        jar.set( 'https://example.com/', 'sid=1; Domain=other.com; Path=/' );

        expect( jar.get( 'https://example.com/' ) ).toBe( 'sid=1' );
        expect( jar.get( 'https://other.com/' ) ).toBe( '' );
    });

    it( 'should store Set-Cookie headers from a Response', () =>
    {
        const headers = new Headers();

        headers.append( 'set-cookie', 'a=1; Path=/' );
        headers.append( 'set-cookie', 'b=2; Path=/' );

        jar.storeFromResponse( 'https://example.com/', headers );

        expect( jar.get( 'https://example.com/' ) ).toBe( 'a=1; b=2' );
    });

    it( 'should list stored cookies without scores', () =>
    {
        jar.set( 'https://example.com/app', 'sid=abc; Path=/app' );

        const listed = jar.cookies();

        expect( listed ).toHaveLength( 1 );
        expect( listed[0].name ).toBe( 'sid' );
        expect( listed[0].value ).toBe( 'abc' );
        expect( listed[0].samesite ).toBe( 'lax' );
        expect( listed[0] ).not.toHaveProperty( 'score' );
        expect( listed[0] ).not.toHaveProperty( 'sourceSite' );
    });

    it( 'should return an empty string for invalid URLs', () =>
    {
        expect( jar.get( 'not-a-url' ) ).toBe( '' );
    });

    describe( 'SameSite', () =>
    {
        it( 'should default an omitted SameSite attribute to Lax', () =>
        {
            jar.set( 'https://example.com/', 'sid=abc; Path=/' );

            expect( jar.cookies()[0].samesite ).toBe( 'lax' );
            expect( jar.get( 'https://example.com/' ) ).toBe( 'sid=abc' );
        });

        it( 'should parse SameSite values case-insensitively', () =>
        {
            jar.set( 'https://a.example.com/', 'strict=1; Path=/; SameSite=STRICT' );
            jar.set( 'https://a.example.com/', 'lax=1; Path=/; SameSite=Lax' );
            jar.set( 'https://a.example.com/', 'none=1; Path=/; SameSite=None; Secure' );

            const modes = jar.cookies().map( c => [ c.name, c.samesite ]);

            expect( modes ).toEqual( expect.arrayContaining([
                [ 'strict', 'strict' ],
                [ 'lax', 'lax' ],
                [ 'none', 'none' ]
            ]));
        });

        it( 'should treat an invalid SameSite value as Lax', () =>
        {
            jar.set( 'https://example.com/', 'sid=1; Path=/; SameSite=weird' );

            expect( jar.cookies()[0].samesite ).toBe( 'lax' );
        });

        it( 'should reject SameSite=None without Secure', () =>
        {
            jar.set( 'https://example.com/', 'sid=1; Path=/; SameSite=None' );

            expect( jar.cookies() ).toHaveLength( 0 );
            expect( jar.get( 'https://example.com/' ) ).toBe( '' );
        });

        it( 'should store SameSite=None when Secure is present', () =>
        {
            jar.set( 'https://example.com/', 'sid=1; Path=/; SameSite=None; Secure' );

            expect( jar.cookies()[0].samesite ).toBe( 'none' );
            expect( jar.get( 'https://example.com/' ) ).toBe( 'sid=1' );
        });

        it( 'should send Lax and Strict cookies on a same-site subdomain hop', () =>
        {
            jar.set( 'https://login.example.com/', 'lax=1; Path=/; Domain=example.com; SameSite=Lax; Secure' );
            jar.set( 'https://login.example.com/', 'strict=1; Path=/; Domain=example.com; SameSite=Strict; Secure' );

            expect( jar.get( 'https://app.example.com/' ) ).toBe( 'lax=1; strict=1' );
        });

        it( 'should send SameSite=None cookies on a same-site subdomain hop', () =>
        {
            jar.set( 'https://login.example.com/', 'sid=1; Path=/; Domain=example.com; SameSite=None; Secure' );

            expect( jar.get( 'https://app.example.com/' ) ).toBe( 'sid=1' );
        });

        it( 'should not send Lax cookies when the initiator is cross-site', () =>
        {
            jar.set( 'https://bank.com/', 'sid=secret; Path=/; SameSite=Lax; Secure' );

            expect( jar.get( 'https://bank.com/transfer', 'https://evil.com/' ) ).toBe( '' );
        });

        it( 'should not send Strict cookies when the initiator is cross-site', () =>
        {
            jar.set( 'https://bank.com/', 'sid=secret; Path=/; SameSite=Strict; Secure' );

            expect( jar.get( 'https://bank.com/transfer', 'https://evil.com/' ) ).toBe( '' );
        });

        it( 'should send SameSite=None; Secure cookies when the initiator is cross-site', () =>
        {
            jar.set( 'https://bank.com/', 'sid=secret; Path=/; SameSite=None; Secure' );

            expect( jar.get( 'https://bank.com/transfer', 'https://evil.com/' ) ).toBe( 'sid=secret' );
        });

        it( 'should not send default (Lax) cookies when the initiator is cross-site', () =>
        {
            jar.set( 'https://bank.com/', 'sid=secret; Path=/; Secure' );

            expect( jar.get( 'https://bank.com/', 'https://evil.com/' ) ).toBe( '' );
        });

        it( 'should send Lax cookies when the initiator is the same site', () =>
        {
            jar.set( 'https://app.example.com/', 'sid=1; Path=/; Domain=example.com; SameSite=Lax; Secure' );

            expect( jar.get( 'https://api.example.com/', 'https://app.example.com/login' ) ).toBe( 'sid=1' );
        });

        it( 'should treat omitted initiator as a first-party request', () =>
        {
            jar.set( 'https://bank.com/', 'sid=1; Path=/; SameSite=Lax; Secure' );

            expect( jar.get( 'https://bank.com/' ) ).toBe( 'sid=1' );
        });

        it( 'should not send Lax cookies across http and https of the same host', () =>
        {
            jar.set( 'http://example.com/', 'sid=1; Path=/; SameSite=Lax' );

            expect( jar.get( 'https://example.com/' ) ).toBe( '' );
            expect( jar.get( 'http://example.com/' ) ).toBe( 'sid=1' );
        });

        it( 'should not send Strict cookies across http and https of the same host', () =>
        {
            jar.set( 'http://example.com/', 'sid=1; Path=/; SameSite=Strict' );

            expect( jar.get( 'https://example.com/' ) ).toBe( '' );
        });

        it( 'should still omit Secure cookies on http even when SameSite is None', () =>
        {
            jar.set( 'https://example.com/', 'sid=1; Path=/; SameSite=None; Secure' );

            expect( jar.get( 'http://example.com/', 'https://evil.com/' ) ).toBe( '' );
        });

        it( 'should send only None cookies when Lax and None are both stored and the initiator is cross-site', () =>
        {
            jar.set( 'https://bank.com/', 'lax=1; Path=/; SameSite=Lax; Secure' );
            jar.set( 'https://bank.com/', 'none=1; Path=/; SameSite=None; Secure' );

            expect( jar.get( 'https://bank.com/', 'https://evil.com/' ) ).toBe( 'none=1' );
        });

        it( 'should treat localhost http and https as different sites', () =>
        {
            jar.set( 'http://localhost:3000/', 'sid=1; Path=/; SameSite=Lax' );

            expect( jar.get( 'https://localhost:3000/' ) ).toBe( '' );
            expect( jar.get( 'http://localhost:8080/' ) ).toBe( 'sid=1' );
        });

        it( 'should treat an invalid initiator as first-party', () =>
        {
            jar.set( 'https://example.com/', 'sid=1; Path=/; SameSite=Lax; Secure' );

            expect( jar.get( 'https://example.com/', 'not-a-url' ) ).toBe( 'sid=1' );
        });

        it( 'should ignore a SameSite=None; Secure cookie whose Domain does not match the request', () =>
        {
            jar.set( 'https://bank.com/', 'sid=1; Path=/; SameSite=None; Secure' );

            expect( jar.get( 'https://evil.com/', 'https://evil.com/' ) ).toBe( '' );
        });
    });
});
