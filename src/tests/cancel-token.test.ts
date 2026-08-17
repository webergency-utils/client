import { describe, it, expect, beforeEach } from 'vitest';
import CancelToken from '../cancel-token';
import HttpError from '../error';

describe( 'CancelToken', () =>
{
    beforeEach( () =>
    {
        /* isolation */
    });

    it( 'should abort the signal when cancel() is called', () =>
    {
        const { token, cancel } = CancelToken.source();

        expect( token.requested ).toBe( false );

        cancel( 'stop' );

        expect( token.requested ).toBe( true );
        expect( token.reason ).toBe( 'stop' );
        expect( token.signal.aborted ).toBe( true );
    });

    it( 'should throw HttpError from throwIfRequested after cancel', () =>
    {
        const { token, cancel } = CancelToken.source();

        cancel( 'gone' );

        try
        {
            token.throwIfRequested();
            expect.fail( 'should throw' );
        }
        catch( error )
        {
            expect( error ).toBeInstanceOf( HttpError );
            expect(( error as HttpError ).code ).toBe( 'CANCELED' );
            expect(( error as HttpError ).message ).toBe( 'gone' );
        }
    });

    it( 'should ignore a second cancel()', () =>
    {
        const { token, cancel } = CancelToken.source();

        cancel( 'first' );
        cancel( 'second' );

        expect( token.reason ).toBe( 'first' );
    });
});
