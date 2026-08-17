import { describe, it, expect, beforeEach, vi } from 'vitest';
import Querystring, { parse, stringify, parseCookies } from '../querystring';

describe( 'Querystring', () =>
{
    beforeEach( () =>
    {
        vi.clearAllMocks();
    });

    it( 'should parse query string', () =>
    {
        // Arrange / Act / Assert
        expect( parse( 'foo=bar' ) ).toEqual({ foo: 'bar' });
        expect( parse( 'foo=bar&bar=foo' ) ).toEqual({ foo: 'bar', bar: 'foo' });
    });

    it( 'should parse query starting with &', () =>
    {
        expect( parse( 'foo=bar&bar=foo&' ) ).toEqual({ foo: 'bar', bar: 'foo' });
        expect( parse( '&foo=bar&bar=foo' ) ).toEqual({ foo: 'bar', bar: 'foo' });
        expect( parse( '&foo=bar&bar=foo&' ) ).toEqual({ foo: 'bar', bar: 'foo' });
    });

    it( 'should parse empty query', () =>
    {
        expect( parse( '&' ) ).toEqual({});
        expect( parse( '=' ) ).toEqual({});
        expect( parse( '&=&=' ) ).toEqual({});
    });

    it( 'should parse empty values', () =>
    {
        expect( parse( 'foo' ) ).toEqual({ foo: null });
        expect( parse( 'foo&bar' ) ).toEqual({ foo: null, bar: null });
        expect( parse( 'foo&bar&' ) ).toEqual({ foo: null, bar: null });
        expect( parse( 'foo=' ) ).toEqual({ foo: '' });
        expect( parse( 'foo&' ) ).toEqual({ foo: null });
        expect( parse( 'foo=&' ) ).toEqual({ foo: '' });
        expect( parse( 'foo=&bar=' ) ).toEqual({ foo: '', bar: '' });
        expect( parse( 'foo=&bar=&' ) ).toEqual({ foo: '', bar: '' });
        expect( parse( 'foo=&bar&' ) ).toEqual({ foo: '', bar: null });
        expect( parse( 'foo=&bar=foo' ) ).toEqual({ foo: '', bar: 'foo' });
        expect( parse( 'foo&bar=foo' ) ).toEqual({ foo: null, bar: 'foo' });
    });

    it( 'should parse arrays', () =>
    {
        expect( parse( 'foo=a&foo=b' ) ).toEqual({ foo: [ 'a', 'b' ] });
        expect( parse( 'foo[]=a&foo[]=b' ) ).toEqual({ foo: [ 'a', 'b' ] });
        expect( parse( 'foo[]=a&foo[1]=b' ) ).toEqual({ foo: [ 'a', 'b' ] });
        expect( parse( 'foo[0]=a&foo[1]=b' ) ).toEqual({ foo: [ 'a', 'b' ] });
        expect( parse( 'foo[1]=a&foo[0]=b' ) ).toEqual({ foo: [ 'b', 'a' ] });
        expect( parse( 'foo[bar]=a&foo[bar]=b' ) ).toEqual({ foo: { bar: [ 'a', 'b' ] }});
        expect( parse( 'foo[bar][]=a&foo[bar][]=b' ) ).toEqual({ foo: { bar: [ 'a', 'b' ] }});
        expect( parse( 'foo[bar][0]=a&foo[bar][1]=b' ) ).toEqual({ foo: { bar: [ 'a', 'b' ] }});
        expect( parse( 'foo[bar][1]=a&foo[bar][0]=b' ) ).toEqual({ foo: { bar: [ 'b', 'a' ] }});
        expect( parse( 'foo[bar][0]=a&foo[bar]=b' ) ).toEqual({ foo: { bar: [ 'a', 'b' ] }});
        expect( parse( 'foo[bar][foo]=a&foo[bar]=b' ) ).toEqual({ foo: { bar: { foo: 'a', '0': 'b' } }});
        expect( parse( 'foo[][foo]=a&foo[][bar]=b&foo[][foo]=c&foo[][bar]=d' ) ).toEqual({
            foo : [{ foo: 'a', bar: 'b' }, { foo: 'c', bar: 'd' }]
        });
    });

    it( 'should parse objects', () =>
    {
        expect( parse( 'foo[bar]=a' ) ).toEqual({ foo: { bar: 'a' } });
        expect( parse( 'foo[bar]=a&foo[]=b' ) ).toEqual({ foo: { bar: 'a', '0': 'b' } });
        expect( parse( 'foo[bar]=a&foo[]=b&foo[]=c' ) ).toEqual({ foo: { bar: 'a', '0': 'b', '1': 'c' } });
        expect( parse( 'foo[]=b&foo[bar]=a&foo[]=c' ) ).toEqual({ foo: { bar: 'a', '0': 'b', '1': 'c' } });
    });

    it( 'should decode keys and values', () =>
    {
        expect( parse( 'foo+bar=bar+foo' ) ).toEqual({ 'foo bar': 'bar foo' });
        expect( parse( 'foo+bar' ) ).toEqual({ 'foo bar': null });
        expect( parse( 'foo+bar=' ) ).toEqual({ 'foo bar': '' });
        expect( parse( 'foo+bar=+' ) ).toEqual({ 'foo bar': ' ' });
    });

    it( 'should parse typed values', () =>
    {
        expect( parse(
            'foo[]=1&foo[]=-1.5&foo[]=true&foo[]=false&foo[]=undefined&foo[]=null&foo[]=bar',
            { types: [ 'null', 'undefined', 'boolean', 'number' ] }
        ) ).toEqual({ foo: [ 1, -1.5, true, false, undefined, null, 'bar' ] });
    });

    it( 'should stringify query', () =>
    {
        // Arrange
        const querystring = stringify({
            bar : true,
            foo : { foo: false, bar: 'foobar' },
            arr : [ 'foo', { foo: 'bar' }, null, 321, undefined, 123.45, undefined ]
        });

        // Act / Assert
        expect( querystring ).toBe( 'bar=1&foo[foo]=0&foo[bar]=foobar&arr[0]=foo&arr[1][foo]=bar&arr[2]&arr[3]=321&arr[5]=123.45' );
        expect( parse( querystring ) ).toEqual({
            bar : '1',
            foo : { foo: '0', bar: 'foobar' },
            arr : [ 'foo', { foo: 'bar' }, null, '321', , '123.45' ]
        });
    });

    it( 'should parse cookies', () =>
    {
        expect( parseCookies( '' ) ).toEqual({});
        expect( parseCookies() ).toEqual({});
        expect( parseCookies( undefined ) ).toEqual({});
        expect( parseCookies( null ) ).toEqual({});
        expect( parseCookies( '    ' ) ).toEqual({});
        expect( parseCookies( 'foo=bar' ) ).toEqual({ foo: 'bar' });
        expect( parseCookies( '  foo  =   bar    ' ) ).toEqual({ foo: 'bar' });
        expect( parseCookies( 'foo=bar; ' ) ).toEqual({ foo: 'bar' });
        expect( parseCookies( 'foo=bar; bar' ) ).toEqual({ foo: 'bar' });
        expect( parseCookies( 'foo=bar; bar = foo' ) ).toEqual({ foo: 'bar', bar: 'foo' });
        expect( parseCookies( 'foo=bar; bar = foo;' ) ).toEqual({ foo: 'bar', bar: 'foo' });
    });

    it( 'should expose stringify and parse on the Querystring class', () =>
    {
        expect( Querystring.stringify({ a: 1 }) ).toBe( 'a=1' );
        expect( Querystring.parse( 'a=1' ) ).toEqual({ a: '1' });
        expect( Querystring.parseCookies( 'a=1' ) ).toEqual({ a: '1' });
    });
});
