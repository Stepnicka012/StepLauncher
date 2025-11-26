import net from "net";

export interface ServerStatus {
    error?: Error;
    ms: number;
    version: string;
    playersConnect: number;
    playersMax: number;
}

export class CustomBuffer {
    private buffer: Buffer;
    private offsetValue: number = 0;

    constructor(existingBuffer: Buffer = Buffer.alloc(48)) {
        this.buffer = existingBuffer;
    }

    writeVarInt(val: number) {
        while (true) {
            if ((val & 0xFFFFFF80) === 0) return this.writeUByte(val);
            this.writeUByte((val & 0x7F) | 0x80);
            val >>>= 7;
        }
    }

    readVarInt(): number {
        let val = 0;
        let count = 0;
        let byte: number;

        do {
            if (count > 5) throw new Error("VarInt is too big");
            byte = this.buffer.readUInt8(this.offsetValue++);
            val |= (byte & 0x7F) << (7 * count++);
        } while ((byte & 0x80) !== 0);

        return val;
    }

    writeString(str: string) {
        const bytes = Buffer.from(str, "utf-8");
        this.writeVarInt(bytes.length);
        this.ensureCapacity(bytes.length);
        bytes.copy(this.buffer, this.offsetValue);
        this.offsetValue += bytes.length;
    }

    readString(): string {
        const length = this.readVarInt();
        if (this.offsetValue + length > this.buffer.length) throw new Error("Buffer overflow");
        const str = this.buffer.toString("utf-8", this.offsetValue, this.offsetValue + length);
        this.offsetValue += length;
        return str;
    }

    writeUShort(val: number) {
        this.writeUByte((val >> 8) & 0xFF);
        this.writeUByte(val & 0xFF);
    }

    writeUByte(val: number) {
        this.ensureCapacity(1);
        this.buffer.writeUInt8(val, this.offsetValue++);
    }

    bufferSlice(): Buffer {
        return this.buffer.slice(0, this.offsetValue);
    }

    offset(): number {
        return this.offsetValue;
    }

    private ensureCapacity(additional: number) {
        if (this.offsetValue + additional > this.buffer.length) {
            this.buffer = Buffer.concat([this.buffer, Buffer.alloc(Math.max(additional, 50))]);
        }
    }
}

export function writePCBuffer(client: net.Socket, buffer: CustomBuffer) {
    const lengthBuffer = new CustomBuffer();
    lengthBuffer.writeVarInt(buffer.bufferSlice().length);
    client.write(Buffer.concat([lengthBuffer.bufferSlice(), buffer.bufferSlice()]));
}

export async function ping(server: string, port: number, timeout = 3000, protocol: number | string = '754'): Promise<ServerStatus> {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const socket = net.connect({ host: server, port }, () => {
            const handshake = new CustomBuffer();
            handshake.writeVarInt(0);
            handshake.writeVarInt(Number(protocol));
            handshake.writeString(server);
            handshake.writeUShort(port);
            handshake.writeVarInt(1);
            writePCBuffer(socket, handshake);

            const request = new CustomBuffer();
            request.writeVarInt(0);
            writePCBuffer(socket, request);
        });

        socket.setTimeout(timeout, () => {
            reject(new Error(`Socket timed out connecting to ${server}:${port}`));
            socket.destroy();
        });

        let readingBuffer = Buffer.alloc(0);

        socket.on("data", (data) => {
            readingBuffer = Buffer.concat([readingBuffer, data]);
            const buffer = new CustomBuffer(readingBuffer);

            let length: number;
            try { length = buffer.readVarInt(); } catch { return; }
            if (readingBuffer.length < length - buffer.offset()) return;

            buffer.readVarInt();

            try {
                const json = JSON.parse(buffer.readString());
                resolve({
                    ms: Date.now() - start,
                    version: json.version.name,
                    playersConnect: json.players.online,
                    playersMax: json.players.max
                });
            } catch (err) {
                reject(err as Error);
            } finally {
                socket.destroy();
            }
        });

        socket.once("error", (err) => {
            reject(err);
            socket.destroy();
        });
    });
}

export class Status {
    constructor(public ip: string = "0.0.0.0", public port: number = 25565) {}
    async getStatus(): Promise<ServerStatus> {
        return ping(this.ip, this.port, 3000);
    }
}
