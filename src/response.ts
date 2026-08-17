export default class ClientResponse
{
    readonly ok      : boolean;
    readonly status  : number;
    readonly headers : Headers;
    readonly url     : string;
    data             : unknown | undefined;

    #response   : Response;
    #buffer     : Uint8Array | undefined;
    #parsedJson : { value: unknown } | undefined;

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
            this.#buffer = new Uint8Array( await this.#response.arrayBuffer() );
        }

        return this.#buffer;
    }

    async json<T = unknown>(): Promise<T>
    {
        if( !this.#parsedJson )
        {
            const text = new TextDecoder().decode( await this.#bytes() );

            this.#parsedJson = { value: text ? JSON.parse( text ) : undefined };
            this.data = this.#parsedJson.value;
        }

        return this.#parsedJson.value as T;
    }

    async text(): Promise<string>
    {
        return new TextDecoder().decode( await this.#bytes() );
    }

    async buffer(): Promise<Uint8Array>
    {
        const bytes = await this.#bytes();

        if( typeof Buffer !== 'undefined' ){ return Buffer.from( bytes ) }

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

        return this.#response.body ?? new ReadableStream();
    }
}
