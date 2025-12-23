/**
 * MANDATE Server Protocol Module
 * Message router and protocol handlers
 */

import { WebSocket } from 'ws';
import {
    PROTOCOL_VERSION,
    type Message,
    type HelloMessage,
    type IntentMessage,
    type EventMessage,
    type AckMessage,
    type SnapshotMessage,
    type ReasonCode,
} from '@mandate/shared';

// =============================================================================
// Types
// =============================================================================

export interface ClientSession {
    playerId: string;
    ws: WebSocket;
    roomId: string | null;
    lastEventSeq: number;
    lastPongTime: number;
    // Intent idempotency: maps client_intent_id -> ACK response
    intentCache: Map<string, AckMessage>;
}

export interface RoomState {
    roomId: string;
    inviteCode: string;
    eventSeq: number;
    eventLog: EventMessage[]; // Bounded log for replay
    players: Map<string, ClientSession>;
    hostPlayerId: string;
}

// =============================================================================
// Message Builder Helpers
// =============================================================================

export function buildEventMessage(
    roomId: string | null,
    type: string,
    eventSeq: number,
    payload: Record<string, unknown>
): EventMessage {
    return {
        protocol_version: PROTOCOL_VERSION,
        room_id: roomId,
        op: 'EVENT',
        type: type as EventMessage['type'],
        event_seq: eventSeq,
        payload,
    };
}

export function buildAck(
    roomId: string | null,
    clientIntentId: string,
    accepted: boolean,
    reasonCode?: ReasonCode,
    details?: string
): AckMessage {
    return {
        protocol_version: PROTOCOL_VERSION,
        room_id: roomId,
        op: 'ACK',
        type: accepted ? 'INTENT_ACCEPTED' : 'INTENT_REJECTED',
        client_intent_id: clientIntentId,
        payload: accepted ? {} : { reason_code: reasonCode, details },
    };
}

export function buildSnapshot(
    roomId: string,
    eventSeq: number,
    payload: Record<string, unknown>
): SnapshotMessage {
    return {
        protocol_version: PROTOCOL_VERSION,
        room_id: roomId,
        op: 'SNAPSHOT',
        type: 'FULL_SNAPSHOT',
        event_seq: eventSeq,
        payload,
    };
}

export function buildPing(): Message {
    return {
        protocol_version: PROTOCOL_VERSION,
        op: 'PING',
    };
}

export function buildPong(): Message {
    return {
        protocol_version: PROTOCOL_VERSION,
        op: 'PONG',
    };
}

export function buildError(code: string, message: string): Message {
    return {
        protocol_version: PROTOCOL_VERSION,
        op: 'ERROR',
        error_code: code,
        message,
    };
}

// =============================================================================
// Message Router
// =============================================================================

export type MessageHandler = (
    session: ClientSession,
    message: Message
) => void;

export interface MessageRouter {
    onHello: (session: ClientSession, message: HelloMessage) => void;
    onIntent: (session: ClientSession, message: IntentMessage) => void;
    onPong: (session: ClientSession) => void;
    onUnknown: (session: ClientSession, message: Message) => void;
}

export function routeMessage(
    router: MessageRouter,
    session: ClientSession,
    raw: string
): void {
    let message: Message;

    try {
        message = JSON.parse(raw) as Message;
    } catch {
        send(session.ws, buildError('PARSE_ERROR', 'Invalid JSON'));
        return;
    }

    // Protocol version check
    if (message.protocol_version !== PROTOCOL_VERSION) {
        send(session.ws, buildError('VERSION_MISMATCH',
            `Expected ${PROTOCOL_VERSION}, got ${message.protocol_version}`));
        session.ws.close();
        return;
    }

    switch (message.op) {
        case 'HELLO':
            router.onHello(session, message as HelloMessage);
            break;
        case 'INTENT':
            router.onIntent(session, message as IntentMessage);
            break;
        case 'PONG':
            router.onPong(session);
            break;
        case 'PING':
            // Client shouldn't send PING, but respond anyway
            send(session.ws, buildPong());
            break;
        default:
            router.onUnknown(session, message);
    }
}

// =============================================================================
// Send Helpers
// =============================================================================

export function send(ws: WebSocket, message: Message | object): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

export function broadcast(
    sessions: Iterable<ClientSession>,
    message: Message | object
): void {
    const data = JSON.stringify(message);
    for (const session of sessions) {
        if (session.ws.readyState === WebSocket.OPEN) {
            session.ws.send(data);
        }
    }
}
