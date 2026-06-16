type WsMetricsSnapshot = {
    activeConnections: number;
    acceptedConnections: number;
    closedConnections: number;
    connectionErrors: number;
    authTimeouts: number;
    invalidMessages: number;
    oversizedMessages: number;
    receivedMessages: number;
    receivedBytes: number;
    sentMessages: number;
    sentBytes: number;
    droppedSends: number;
    sendErrors: number;
};

class WsMetricsService {
    #acceptedConnections = 0;
    #closedConnections = 0;
    #connectionErrors = 0;
    #authTimeouts = 0;
    #invalidMessages = 0;
    #oversizedMessages = 0;
    #receivedMessages = 0;
    #receivedBytes = 0;
    #sentMessages = 0;
    #sentBytes = 0;
    #droppedSends = 0;
    #sendErrors = 0;

    recordConnectionAccepted(): void {
        this.#acceptedConnections += 1;
    }

    recordConnectionClosed(): void {
        this.#closedConnections += 1;
    }

    recordConnectionError(): void {
        this.#connectionErrors += 1;
    }

    recordAuthTimeout(): void {
        this.#authTimeouts += 1;
    }

    recordInvalidMessage(): void {
        this.#invalidMessages += 1;
    }

    recordOversizedMessage(): void {
        this.#oversizedMessages += 1;
    }

    recordMessageReceived(bytes: number): void {
        this.#receivedMessages += 1;
        this.#receivedBytes += bytes;
    }

    recordMessageSent(bytes: number): void {
        this.#sentMessages += 1;
        this.#sentBytes += bytes;
    }

    recordDroppedSend(): void {
        this.#droppedSends += 1;
    }

    recordSendError(): void {
        this.#sendErrors += 1;
    }

    snapshot(activeConnections: number): WsMetricsSnapshot {
        return {
            activeConnections,
            acceptedConnections: this.#acceptedConnections,
            closedConnections: this.#closedConnections,
            connectionErrors: this.#connectionErrors,
            authTimeouts: this.#authTimeouts,
            invalidMessages: this.#invalidMessages,
            oversizedMessages: this.#oversizedMessages,
            receivedMessages: this.#receivedMessages,
            receivedBytes: this.#receivedBytes,
            sentMessages: this.#sentMessages,
            sentBytes: this.#sentBytes,
            droppedSends: this.#droppedSends,
            sendErrors: this.#sendErrors,
        };
    }
}

export const wsMetricsService = new WsMetricsService();