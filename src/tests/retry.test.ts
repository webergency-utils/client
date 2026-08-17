import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computeRetryDelay, normalizeRetry, retryDelay, shouldRetry } from '../retry';

describe( 'retry', () =>
{
    beforeEach( () =>
    {
        vi.clearAllMocks();
    });

    it( 'should use exponential backoff when Retry-After is absent', () =>
    {
        expect( retryDelay( 0, null ) ).toBe( 250 );
        expect( retryDelay( 1, null ) ).toBe( 500 );
        expect( retryDelay( 10, null ) ).toBe( 30_000 );
    });

    it( 'should honor Retry-After seconds and HTTP-date', () =>
    {
        expect( retryDelay( 0, '2' ) ).toBe( 2000 );

        const at = Date.now() + 1500;

        expect( retryDelay( 0, new Date( at ).toUTCString() ) ).toBeGreaterThanOrEqual( 0 );
        expect( retryDelay( 0, new Date( at ).toUTCString() ) ).toBeLessThanOrEqual( 1500 );
    });

    it( 'should apply a custom delay function', () =>
    {
        const retry = normalizeRetry({ delay: () => 0, jitter: false });

        expect( computeRetryDelay( 3, '9', retry ) ).toBe( 0 );
    });

    it( 'should add jitter when enabled', () =>
    {
        const retry = normalizeRetry({ delay: () => 1000, jitter: 0.2 });

        expect( computeRetryDelay( 0, null, retry, () => 1 ) ).toBe( 1200 );
        expect( computeRetryDelay( 0, null, retry, () => 0 ) ).toBe( 1000 );
    });

    it( 'should treat jitter true as 20 percent', () =>
    {
        const retry = normalizeRetry({ delay: () => 100, jitter: true });

        expect( retry.jitter ).toBe( 0.2 );
        expect( computeRetryDelay( 0, null, retry, () => 0.5 ) ).toBe( 110 );
    });

    it( 'should not retry past the limit or unsafe methods', () =>
    {
        const retry = normalizeRetry({ limit: 1 });

        expect( shouldRetry({ attempt: 1, method: 'GET', retry, status: 503 }) ).toBe( false );
        expect( shouldRetry({ attempt: 0, method: 'POST', retry, status: 503 }) ).toBe( false );
        expect( shouldRetry({ attempt: 0, method: 'GET', retry, status: 503 }) ).toBe( true );
        expect( shouldRetry({ attempt: 0, method: 'GET', retry, error: new Error( 'net' ) }) ).toBe( true );
    });
});
