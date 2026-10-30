import { describe, it, expect, beforeEach, vi } from 'vitest';
import Querystring, { parse, stringify, parseCookies } from '../src/querystring';

describe( 'Querystring', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
    });

    it( 'should parse query string', () =>
    {
        // Arrange / Act / Assert
        expect( parse( 'foo=bar' )).toEqual({ foo : 'bar' });
        expect( parse( 'foo=bar&bar=foo' )).toEqual({ foo : 'bar', bar : 'foo' });
    });

    it( 'should parse query starting with &', () =>
    {
        expect( parse( 'foo=bar&bar=foo&' )).toEqual({ foo : 'bar', bar : 'foo' });
        expect( parse( '&foo=bar&bar=foo' )).toEqual({ foo : 'bar', bar : 'foo' });
        expect( parse( '&foo=bar&bar=foo&' )).toEqual({ foo : 'bar', bar : 'foo' });
    });

    it( 'should parse empty query', () =>
    {
        expect( parse( '&' )).toEqual({});
        expect( parse( '=' )).toEqual({});
        expect( parse( '&=&=' )).toEqual({});
        expect( parse( '=val' )).toEqual({});
    });

    it( 'should parse empty values and single-character bare keys', () =>
    {
        expect( parse( 'a' )).toEqual({ a : null });
        expect( parse( 'a&b=1' )).toEqual({ a : null, b : '1' });
        expect( parse( 'foo' )).toEqual({ foo : null });
        expect( parse( 'foo&bar' )).toEqual({ foo : null, bar : null });
        expect( parse( 'foo&bar&' )).toEqual({ foo : null, bar : null });
        expect( parse( 'foo=' )).toEqual({ foo : '' });
        expect( parse( 'foo&' )).toEqual({ foo : null });
        expect( parse( 'foo=&' )).toEqual({ foo : '' });
        expect( parse( 'foo=&bar=' )).toEqual({ foo : '', bar : '' });
        expect( parse( 'foo=&bar=&' )).toEqual({ foo : '', bar : '' });
        expect( parse( 'foo=&bar&' )).toEqual({ foo : '', bar : null });
        expect( parse( 'foo=&bar=foo' )).toEqual({ foo : '', bar : 'foo' });
        expect( parse( 'foo&bar=foo' )).toEqual({ foo : null, bar : 'foo' });
    });

    it( 'should parse arrays', () =>
    {
        expect( parse( 'foo=a&foo=b' )).toEqual({ foo : [ 'a', 'b' ] });
        expect( parse( 'foo[]=a&foo[]=b' )).toEqual({ foo : [ 'a', 'b' ] });
        expect( parse( 'foo[]=a&foo[1]=b' )).toEqual({ foo : [ 'a', 'b' ] });
        expect( parse( 'foo[0]=a&foo[1]=b' )).toEqual({ foo : [ 'a', 'b' ] });
        expect( parse( 'foo[1]=a&foo[0]=b' )).toEqual({ foo : [ 'b', 'a' ] });
        expect( parse( 'foo[bar]=a&foo[bar]=b' )).toEqual({ foo : { bar : [ 'a', 'b' ] }});
        expect( parse( 'foo[bar][]=a&foo[bar][]=b' )).toEqual({ foo : { bar : [ 'a', 'b' ] }});
        expect( parse( 'foo[bar][0]=a&foo[bar][1]=b' )).toEqual({ foo : { bar : [ 'a', 'b' ] }});
        expect( parse( 'foo[bar][1]=a&foo[bar][0]=b' )).toEqual({ foo : { bar : [ 'b', 'a' ] }});
        expect( parse( 'foo[bar][0]=a&foo[bar]=b' )).toEqual({ foo : { bar : [ 'a', 'b' ] }});
        expect( parse( 'foo[bar][foo]=a&foo[bar]=b' )).toEqual({ foo : { bar : { foo : 'a', '0' : 'b' } }});
        expect( parse( 'foo[][foo]=a&foo[][bar]=b&foo[][foo]=c&foo[][bar]=d' )).toEqual({
            foo : [{ foo : 'a', bar : 'b' }, { foo : 'c', bar : 'd' }]
        });
    });

    it( 'should parse objects', () =>
    {
        expect( parse( 'foo[bar]=a' )).toEqual({ foo : { bar : 'a' } });
        expect( parse( 'foo[bar]=a&foo[]=b' )).toEqual({ foo : { bar : 'a', '0' : 'b' } });
        expect( parse( 'foo[bar]=a&foo[]=b&foo[]=c' )).toEqual({ foo : { bar : 'a', '0' : 'b', '1' : 'c' } });
        expect( parse( 'foo[]=b&foo[bar]=a&foo[]=c' )).toEqual({ foo : { bar : 'a', '0' : 'b', '1' : 'c' } });
        expect( parse( 'foo=scalar&foo[bar]=a' )).toEqual({ foo : { bar : 'a' } });
    });

    it( 'should decode keys and values and tolerate malformed percent-encoding', () =>
    {
        expect( parse( 'foo+bar=bar+foo' )).toEqual({ 'foo bar' : 'bar foo' });
        expect( parse( 'foo+bar' )).toEqual({ 'foo bar' : null });
        expect( parse( 'foo+bar=' )).toEqual({ 'foo bar' : '' });
        expect( parse( 'foo+bar=+' )).toEqual({ 'foo bar' : ' ' });
        expect( parse( 'promo=50%off&%E0%A4%A=1' )).toEqual({ promo : '50%off', '%E0%A4%A' : '1' });
    });

    it( 'should parse typed values', () =>
    {
        expect( parse(
            'foo[]=1&foo[]=-1.5&foo[]=true&foo[]=false&foo[]=undefined&foo[]=null&foo[]=bar',
            { types : [ 'null', 'undefined', 'boolean', 'number' ] }
        )).toEqual({ foo : [ 1, -1.5, true, false, undefined, null, 'bar' ] });
    });

    it( 'should stringify query and encode special characters in keys', () =>
    {
        // Arrange
        const queryString = stringify({
            bar : true,
            foo : { foo : false, bar : 'foobar' },
            arr : [ 'foo', { foo : 'bar' }, null, 321, undefined, 123.45, undefined ]
        });

        // Act / Assert
        expect( queryString ).toBe( 'bar=1&foo[foo]=0&foo[bar]=foobar&arr[0]=foo&arr[1][foo]=bar&arr[2]&arr[3]=321&arr[5]=123.45' );
        expect( parse( queryString )).toEqual({
            bar : '1',
            foo : { foo : '0', bar : 'foobar' },
            arr : [ 'foo', { foo : 'bar' }, null, '321', undefined, '123.45' ]
        });

        const special = stringify({ 'a b' : 1, 'x&y' : { 'c=d' : 'ok' } });

        expect( special ).toBe( 'a%20b=1&x%26y[c%3Dd]=ok' );
        expect( parse( special )).toEqual({ 'a b' : '1', 'x&y' : { 'c=d' : 'ok' } });
    });

    it( 'should ignore top-level primitives when stringifying without a key prefix', () =>
    {
        expect( stringify( null )).toBe( '' );
        expect( stringify( undefined )).toBe( '' );
        expect( stringify( true )).toBe( '' );
        expect( stringify( 42 )).toBe( '' );
        expect( stringify( 'raw' )).toBe( '' );
    });

    it( 'should parse cookies and ignore prototype-polluting or malformed keys', () =>
    {
        expect( parseCookies( '' )).toEqual({});
        expect( parseCookies()).toEqual({});
        expect( parseCookies( undefined )).toEqual({});
        expect( parseCookies( null )).toEqual({});
        expect( parseCookies( '    ' )).toEqual({});
        expect( parseCookies( 'foo=bar' )).toEqual({ foo : 'bar' });
        expect( parseCookies( '  foo  =   bar    ' )).toEqual({ foo : 'bar' });
        expect( parseCookies( 'foo=bar; ' )).toEqual({ foo : 'bar' });
        expect( parseCookies( 'foo=bar; bar' )).toEqual({ foo : 'bar' });
        expect( parseCookies( 'foo=bar; bar = foo' )).toEqual({ foo : 'bar', bar : 'foo' });
        expect( parseCookies( 'foo=bar; bar = foo;' )).toEqual({ foo : 'bar', bar : 'foo' });
        expect( parseCookies( '; foo=bar;; promo=50%off; __proto__=bad; =empty' )).toEqual({ foo : 'bar', promo : '50%off' });
    });

    it( 'should expose stringify and parse on the Querystring class', () =>
    {
        expect( Querystring.stringify({ a : 1 })).toBe( 'a=1' );
        expect( Querystring.parse( 'a=1' )).toEqual({ a : '1' });
        expect( Querystring.parseCookies( 'a=1' )).toEqual({ a : '1' });
    });

    it( 'should skip inherited enumerable keys when stringifying', () =>
    {
        const data = Object.create({ inherited : 1 });

        data.own = 2;

        expect( stringify( data )).toBe( 'own=2' );
    });

    it( 'should skip function and symbol values when stringifying', () =>
    {
        expect( stringify({ fn : () => 1, s : Symbol( 'x' ) })).toBe( '' );
    });

    it( 'should attach sequential scalars onto an existing object', () =>
    {
        expect( parse( 'foo[bar][foo]=a&foo[bar]=b&foo[bar]=c' )).toEqual({
            foo : { bar : { foo : 'a', '0' : 'b', '1' : 'c' } }
        });
        expect( parse( 'foo[2]=a&foo[0]=b&foo[bar]=c&foo=d' )).toEqual({
            foo : { '0' : 'b', '2' : 'a', bar : 'c', '3' : 'd' }
        });
    });

    it( 'should prevent prototype pollution and allow Object.prototype property names as keys', () =>
    {
        const parsed = parse( '__proto__[polluted]=yes&constructor[prototype][polluted]=yes&a[prototype][b]=1&assign=ok&toString=str&a[][hasOwnProperty]=1&a[][hasOwnProperty]=2' );

        expect(({} as Record<string, unknown> ).polluted ).toBeUndefined();
        expect( parsed ).toEqual({
            assign   : 'ok',
            toString : 'str',
            a        : [{ hasOwnProperty : '1' }, { hasOwnProperty : '2' }]
        });
    });

    it( 'should treat indices above MAX_ARRAY_INDEX as object keys instead of allocating sparse arrays', () =>
    {
        const parsed = parse( 'a[99999999]=1' );

        expect( Array.isArray( parsed.a )).toBe( false );
        expect( parsed ).toEqual({ a : { '99999999' : '1' } });
        expect( stringify( parsed )).toBe( 'a[99999999]=1' );
    });
});
