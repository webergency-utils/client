import HttpError from './error';

export type CancelExecutor = ( cancel: ( message?: string ) => void ) => void;

export type CancelTokenSource =
{
    token  : CancelToken
    cancel : ( message?: string ) => void
}

export default class CancelToken
{
    #controller : AbortController;
    #reason     : string | undefined;
    #requested  : boolean;

    constructor( executor: CancelExecutor )
    {
        this.#controller = new AbortController();
        this.#requested = false;

        executor( ( message ) => this.#cancel( message ) );
    }

    get signal(): AbortSignal
    {
        return this.#controller.signal;
    }

    get reason(): string | undefined
    {
        return this.#reason;
    }

    get requested(): boolean
    {
        return this.#requested;
    }

    throwIfRequested(): void
    {
        if( !this.#requested ){ return }

        throw new HttpError( this.#reason ?? 'Request canceled', { code: 'CANCELED' });
    }

    static source(): CancelTokenSource
    {
        let cancel!: ( message?: string ) => void;
        const token = new CancelToken( ( next ) => { cancel = next });

        return { token, cancel };
    }

    #cancel( message?: string ): void
    {
        if( this.#requested ){ return }

        this.#requested = true;
        this.#reason = message;
        this.#controller.abort( message );
    }
}
