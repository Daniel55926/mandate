/**
 * WebSocket Client
 * Full networking layer implementation per 05_networking_protocol.md
 * 
 * Features:
 * - HELLO/HELLO_OK handshake with resume support
 * - PING/PONG heartbeat handling
 * - Event sequencing via EventSequencer
 * - Intent dispatch via IntentDispatcher
 * - Automatic reconnection
 */

import {
    PROTOCOL_VERSION,
    type Message,
    type EventMessage,
    type SnapshotMessage,
    type AckMessage,
    type IntentType,
    type ReasonCode,
} from '@mandate/shared';

import { EventSequencer } from './EventSequencer';
import { IntentDispatcher } from './IntentDispatcher';

// =============================================================================
// Types
// =============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
export type StatusCallback = (status: ConnectionStatus) => void;
export type EventCallback = (event: EventMessage) => void;
export type SnapshotCallback = (snapshot: SnapshotMessage) => void;

// =============================================================================
// WsClient
// =============================================================================

export class WsClient {
    private url: string;
    private ws: WebSocket | null = null;
    private status: ConnectionStatus = 'disconnected';
    private playerId: string | null = null;
    private roomId: string | null = null;

    // Callbacks
    private statusCallbacks: StatusCallback[] = [];
    private eventCallbacks: EventCallback[] = [];
    private snapshotCallbacks: SnapshotCallback[] = [];

    // Protocol components
    private sequencer: EventSequencer;
    private dispatcher: IntentDispatcher;

    // Reconnection
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelayMs = 1000;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(url: string) {
        this.url = url;
        this.dispatcher = new IntentDispatcher();
        this.sequencer = new EventSequencer(
            (event) => this.handleEvent(event),
            (snapshot) => this.handleSnapshot(snapshot),
            (lastSeq, receivedSeq) => this.handleGap(lastSeq, receivedSeq)
        );
    }

    // ===========================================================================
    // Public API
    // ===========================================================================

    get isConnected(): boolean {
        return this.status === 'connected';
    }

    get currentPlayerId(): string | null {
        return this.playerId;
    }

    get currentRoomId(): string | null {
        return this.roomId;
    }

    connect(): void {
        if (this.ws) {
            this.ws.close();
        }

        this.setStatus('connecting');
        console.log(`[WsClient] Connecting to ${this.url}...`);

        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            console.log('[WsClient] WebSocket opened');
            this.reconnectAttempts = 0;
            this.sendHello();
        };

        this.ws.onmessage = (event) => {
            this.handleMessage(event.data);
        };

        this.ws.onclose = () => {
            console.log('[WsClient] WebSocket closed');
            this.setStatus('disconnected');
            this.attemptReconnect();
        };

        this.ws.onerror = (err) => {
            console.error('[WsClient] WebSocket error:', err);
        };
    }

    disconnect(): void {
        this.cancelReconnect();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.setStatus('disconnected');
    }

    /**
     * Send an intent to the server
     */
    sendIntent(
        type: IntentType,
        payload: Record<string, unknown> = {},
        callbacks?: {
            onAccepted?: () => void;
            onRejected?: (reason: ReasonCode, details?: string) => void;
        }
    ): string | null {
        if (!this.isConnected) {
            console.warn('[WsClient] Cannot send intent: not connected');
            return null;
        }

        const { intentId, message } = this.dispatcher.createIntent(type, payload, callbacks);

        // Add room_id if we're in a room
        if (this.roomId) {
            (message as Record<string, unknown>).room_id = this.roomId;
        }

        this.send(message);
        return intentId;
    }

    // ===========================================================================
    // Event Subscriptions
    // ===========================================================================

    onStatusChange(callback: StatusCallback): () => void {
        this.statusCallbacks.push(callback);
        return () => {
            const idx = this.statusCallbacks.indexOf(callback);
            if (idx >= 0) this.statusCallbacks.splice(idx, 1);
        };
    }

    onEvent(callback: EventCallback): () => void {
        this.eventCallbacks.push(callback);
        return () => {
            const idx = this.eventCallbacks.indexOf(callback);
            if (idx >= 0) this.eventCallbacks.splice(idx, 1);
        };
    }

    onSnapshot(callback: SnapshotCallback): () => void {
        this.snapshotCallbacks.push(callback);
        return () => {
            const idx = this.snapshotCallbacks.indexOf(callback);
            if (idx >= 0) this.snapshotCallbacks.splice(idx, 1);
        };
    }

    // ===========================================================================
    // Private: Message Handling
    // ===========================================================================

    private handleMessage(data: string): void {
        let message: Message;
        try {
            message = JSON.parse(data) as Message;
        } catch {
            console.error('[WsClient] Failed to parse message');
            return;
        }

        // Version check
        if (message.protocol_version !== PROTOCOL_VERSION) {
            console.error(`[WsClient] Protocol version mismatch: ${message.protocol_version}`);
            this.disconnect();
            return;
        }

        switch (message.op) {
            case 'EVENT':
                this.sequencer.processEvent(message as EventMessage);
                break;

            case 'SNAPSHOT':
                this.sequencer.processSnapshot(message as SnapshotMessage);
                break;

            case 'ACK':
                this.dispatcher.handleAck(message as AckMessage);
                break;

            case 'PING':
                this.sendPong();
                break;

            case 'ERROR':
                console.error('[WsClient] Server error:', message);
                break;

            default:
                console.log('[WsClient] Unknown op:', message.op);
        }
    }

    private handleEvent(event: EventMessage): void {
        console.log(`[WsClient] Event: ${event.type} (seq: ${event.event_seq})`);

        // Special handling for HELLO_OK
        if (event.type === 'HELLO_OK') {
            this.playerId = event.payload.player_id as string;
            this.setStatus('connected');
            console.log(`[WsClient] Connected as ${this.playerId}`);
        }

        // Track room_id from events
        if (event.room_id) {
            this.roomId = event.room_id;
        }

        // Notify subscribers
        for (const cb of this.eventCallbacks) {
            cb(event);
        }
    }

    private handleSnapshot(snapshot: SnapshotMessage): void {
        console.log(`[WsClient] Snapshot received (seq: ${snapshot.event_seq})`);

        // Update room tracking
        if (snapshot.room_id) {
            this.roomId = snapshot.room_id;
        }

        // Notify subscribers
        for (const cb of this.snapshotCallbacks) {
            cb(snapshot);
        }
    }

    private handleGap(lastSeq: number, receivedSeq: number): void {
        console.log(`[WsClient] Gap detected: last=${lastSeq}, received=${receivedSeq}`);
        // Request snapshot to recover
        this.sendIntent('REQUEST_SNAPSHOT');
    }

    // ===========================================================================
    // Private: Protocol Messages
    // ===========================================================================

    private sendHello(): void {
        const hello: Record<string, unknown> = {
            protocol_version: PROTOCOL_VERSION,
            op: 'HELLO',
            type: 'HELLO',
            payload: {
                client_build: 'web-0.1.0',
            },
        };

        // Include resume data if we have it
        if (this.roomId && this.sequencer.getLastEventSeq() > 0) {
            hello.payload = {
                ...(hello.payload as object),
                resume: {
                    room_id: this.roomId,
                    last_event_seq: this.sequencer.getLastEventSeq(),
                },
            };
        }

        this.send(hello);
    }

    private sendPong(): void {
        this.send({
            protocol_version: PROTOCOL_VERSION,
            op: 'PONG',
        });
    }

    private send(message: object): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    // ===========================================================================
    // Private: Status & Reconnection
    // ===========================================================================

    private setStatus(status: ConnectionStatus): void {
        if (this.status === status) return;
        this.status = status;
        for (const cb of this.statusCallbacks) {
            cb(status);
        }
    }

    private attemptReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('[WsClient] Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);
        console.log(`[WsClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }

    private cancelReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnectAttempts = 0;
    }
}
