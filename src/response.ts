import { getBuffer } from './runtime';

const TEXT_DECODER = new TextDecoder();

export default class ClientResponse
{
    readonly ok      : boolean;
    readonly status  : number;
    readonly headers : Headers;
    readonly url     : string;
    data             : unknown | undefined;

    #response     : Response;
    #buffer       : Uint8Array | undefined;
    #bytesPromise : Promise<Uint8Array> | undefined;
    #parsedJson   : { value : unknown } | undefined;

    constructor( response: Response )
    {
        this.#response = response;
        this.ok = response.ok;
        this.status = response.status;
        this.headers = response.headers;
        this.url = response.url;
    }

    get raw(): Response
    {
        return this.#response;
    }

    async #bytes(): Promise<Uint8Array>
    {
        if( !this.#buffer )
        {
            this.#bytesPromise ??= this.#response.arrayBuffer().then( ab =>
            {
                this.#buffer = new Uint8Array( ab );

                return this.#buffer;
            });

            return this.#bytesPromise;
        }

        return this.#buffer;
    }

    async json<T = unknown>(): Promise<T>
    {
        if( !this.#parsedJson )
        {
            const text = TEXT_DECODER.decode( await this.#bytes());

            this.#parsedJson = { value : text ? JSON.parse( text ) : undefined };
            this.data = this.#parsedJson.value;
        }

        return this.#parsedJson.value as T;
    }

    async text(): Promise<string>
    {
        return TEXT_DECODER.decode( await this.#bytes());
    }

    async buffer(): Promise<Uint8Array>
    {
        const bytes = await this.#bytes();

        const BufferCtor = getBuffer();

        if( BufferCtor ){ return BufferCtor.from( bytes ) }

        return bytes;
    }

    stream(): ReadableStream<Uint8Array>
    {
        if( this.#buffer )
        {
            const bytes = this.#buffer;

            return new ReadableStream({
                start( controller )
                {
                    controller.enqueue( bytes );
                    controller.close();
                }
            });
        }

        return this.#response.body ?? new ReadableStream({
            start( controller )
            {
                controller.close();
            }
        });
    }
}
