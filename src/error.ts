export type HttpErrorCode = 'HTTP_ERROR' | 'TIMEOUT' | 'NETWORK' | 'CANCELED';

export default class HttpError extends Error
{
    readonly status   : number | undefined;
    readonly code     : HttpErrorCode;
    readonly body     : unknown;
    readonly response : Response | undefined;

    constructor( message: string, options:
    {
        status?   : number
        code      : HttpErrorCode
        body?     : unknown
        response? : Response
        cause?    : unknown
    })
    {
        super( message, options.cause !== undefined ? { cause: options.cause } : undefined );

        this.name = 'HttpError';
        this.status = options.status;
        this.code = options.code;
        this.body = options.body;
        this.response = options.response;
    }
}
