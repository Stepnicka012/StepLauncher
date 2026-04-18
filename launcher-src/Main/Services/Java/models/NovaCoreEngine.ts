import { EngineProcess, type EngineProcessOptions } from "../EngineProcess.js";
import { NovaCoreClient, type NovaCoreClientOptions } from "./NovaCoreClient.js";

export type NovaCoreEngineOptions = EngineProcessOptions & {
    client?: Pick<NovaCoreClientOptions, "timeoutMs" | "autoReconnect" | "reconnectDelay" | "maxReconnectAttempts" | "onStatusChange">;
};

export class NovaCoreEngine {
    static async start(opts: NovaCoreEngineOptions): Promise<NovaCoreClient> {
        const proc = new EngineProcess(opts);
        const info = await proc.start();
        const client = new NovaCoreClient({
            httpUrl: info.httpUrl,
            wsUrl: info.wsUrl,
            token: info.token,
            timeoutMs: opts.client?.timeoutMs,
            autoReconnect: opts.client?.autoReconnect,
            reconnectDelay: opts.client?.reconnectDelay,
            maxReconnectAttempts: opts.client?.maxReconnectAttempts,
            onStatusChange: opts.client?.onStatusChange,
        });
        await client.connect();
        return client;
    }

    static async startWithHandle(opts: NovaCoreEngineOptions): Promise<{
        client: NovaCoreClient;
        process: EngineProcess;
    }> {
        const proc = new EngineProcess(opts);
        const info = await proc.start();
        const client = new NovaCoreClient({
            httpUrl: info.httpUrl,
            wsUrl: info.wsUrl,
            token: info.token,
            timeoutMs: opts.client?.timeoutMs,
            autoReconnect: opts.client?.autoReconnect,
            reconnectDelay: opts.client?.reconnectDelay,
            maxReconnectAttempts: opts.client?.maxReconnectAttempts,
            onStatusChange: opts.client?.onStatusChange,
        });
        await client.connect();
        return { client, process: proc };
    }
}