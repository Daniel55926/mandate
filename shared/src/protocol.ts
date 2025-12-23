/**
 * MANDATE Protocol Types
 * Based on 05_networking_protocol.md
 */

// =============================================================================
// Protocol Constants
// =============================================================================

export const PROTOCOL_VERSION = '0.1';
export const DIGITAL_RULESET_VERSION = '0.1';

// =============================================================================
// Message Operations
// =============================================================================

export type MessageOp =
    | 'HELLO'
    | 'INTENT'
    | 'ACK'
    | 'EVENT'
    | 'SNAPSHOT'
    | 'PING'
    | 'PONG'
    | 'ERROR';

// =============================================================================
// Intent Types (Client → Server)
// =============================================================================

export type IntentType =
    // Room / Lobby
    | 'CREATE_ROOM'
    | 'JOIN_ROOM'
    | 'LEAVE_ROOM'
    | 'START_READY_CHECK'
    | 'CANCEL_READY_CHECK'
    | 'SET_READY'
    | 'CLIENT_LOADED'
    | 'REQUEST_REMATCH'
    // Gameplay
    | 'PLAY_CARD'
    | 'PASS'
    | 'DECLARE_CRISIS'
    | 'REQUEST_SNAPSHOT'
    // Social / UX
    | 'SET_EMOTE'
    | 'SET_BROWSING_HAND';

// =============================================================================
// Event Types (Server → Client)
// =============================================================================

export type EventType =
    // Handshake
    | 'HELLO_OK'
    // Room
    | 'ROOM_STATE'
    | 'READY_CHECK_STARTED'
    | 'READY_CHECK_CANCELED'
    | 'MATCH_LOADING_BEGIN'
    // Match / Round
    | 'MATCH_STARTED'
    | 'ROUND_STARTED'
    | 'TURN_STARTED'
    | 'TURN_ENDED'
    | 'ROUND_ENDED'
    | 'MATCH_RESULT'
    // Gameplay
    | 'CARD_PLAYED'
    | 'CARD_DRAWN'
    | 'DISTRICT_CLAIMED'
    // Crisis
    | 'CRISIS_DECLARATION_REQUIRED'
    | 'CRISIS_DECLARED'
    // Hand (private)
    | 'HAND_SNAPSHOT'
    | 'HAND_DELTA'
    // Presence
    | 'PLAYER_PRESENCE'
    // Connection
    | 'PLAYER_DISCONNECTED'
    | 'PLAYER_RECONNECTED'
    | 'PLAYER_FORFEITED';

// =============================================================================
// ACK Types
// =============================================================================

export type AckType = 'INTENT_ACCEPTED' | 'INTENT_REJECTED';

// =============================================================================
// Reason Codes
// =============================================================================

export type ReasonCode =
    // Lobby
    | 'ROOM_FULL'
    | 'ROOM_NOT_FOUND'
    | 'NOT_HOST'
    | 'NOT_IN_READY_CHECK'
    | 'ALREADY_IN_MATCH'
    // Match
    | 'NO_MATCH'
    | 'NOT_IN_MATCH'
    // Phase / Turn
    | 'INVALID_PHASE'
    | 'NOT_YOUR_TURN'
    | 'TURN_TIMER_EXPIRED'
    | 'CRISIS_TIMER_EXPIRED'
    | 'NO_LEGAL_MOVES'
    // Card / Placement
    | 'CARD_NOT_IN_HAND'
    | 'DISTRICT_NOT_FOUND'
    | 'DISTRICT_CLAIMED'
    | 'SIDE_FULL'
    | 'SLOT_OCCUPIED'
    | 'INVALID_SLOT_INDEX'
    | 'PLAY_FAILED'
    // Crisis
    | 'CRISIS_NOT_PENDING'
    | 'CRISIS_DECLARATION_INVALID'
    | 'CRISIS_VALUE_NOT_ALLOWED'
    // General
    | 'RATE_LIMITED'
    | 'INTERNAL_ERROR'
    | 'VERSION_MISMATCH';

// =============================================================================
// Message Envelopes
// =============================================================================

export interface BaseMessage {
    protocol_version: string;
    room_id?: string | null;
    op: MessageOp;
}

export interface HelloMessage extends BaseMessage {
    op: 'HELLO';
    type: 'HELLO';
    payload: {
        auth_token?: string;
        client_build?: string;
        resume?: {
            room_id: string;
            last_event_seq: number;
        };
    };
}

export interface IntentMessage extends BaseMessage {
    op: 'INTENT';
    type: IntentType;
    client_intent_id: string;
    payload: Record<string, unknown>;
}

export interface AckMessage extends BaseMessage {
    op: 'ACK';
    type: AckType;
    client_intent_id: string;
    payload: {
        reason_code?: ReasonCode;
        details?: string;
    };
}

export interface EventMessage extends BaseMessage {
    op: 'EVENT';
    type: EventType | 'HELLO_OK';
    event_seq: number;
    payload: Record<string, unknown>;
}

export interface SnapshotMessage extends BaseMessage {
    op: 'SNAPSHOT';
    type: 'FULL_SNAPSHOT';
    event_seq: number;
    payload: Record<string, unknown>;
}

export interface PingMessage extends BaseMessage {
    op: 'PING';
}

export interface PongMessage extends BaseMessage {
    op: 'PONG';
}

export interface ErrorMessage extends BaseMessage {
    op: 'ERROR';
    error_code: string;
    message: string;
}

export type Message =
    | HelloMessage
    | IntentMessage
    | AckMessage
    | EventMessage
    | SnapshotMessage
    | PingMessage
    | PongMessage
    | ErrorMessage;
