import { WebSocket, type RawData } from 'ws';
import { config } from '../config.js';
import { wsMetricsService } from '../services/ws-metrics.service.js';
import type { ServerMessage } from '../types/messages.js';

export function payloadSize(raw: RawData): number {
    if (typeof raw === 'string') return Buffer.byteLength(raw);
    if (Array.isArray(raw)) {
        return raw.reduce((total, chunk) => total + chunk.byteLength, 0);
    }
    return raw.byteLength;
}

export function safeSend(socket: WebSocket, message: ServerMessage): boolean {
    if (socket.readyState !== WebSocket.OPEN) {
        wsMetricsService.recordDroppedSend();
        return false;
    }

    if (socket.bufferedAmount > config.wsMaxBufferedBytes) {
        wsMetricsService.recordDroppedSend();
        socket.close(1013, 'socket backpressure');
        return false;
    }

    const payload = JSON.stringify(message);

    try {
        socket.send(payload, (error: Error | undefined) => {
            if (error) {
                wsMetricsService.recordSendError();
                socket.terminate();
                return;
            }

            wsMetricsService.recordMessageSent(Buffer.byteLength(payload));
        });
        return true;
    } catch {
        wsMetricsService.recordSendError();
        socket.terminate();
        return false;
    }
}