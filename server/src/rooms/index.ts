/**
 * MANDATE Server Room Manager
 * Full lobby lifecycle: ROOM_OPEN → ROOM_READY_CHECK → ROOM_LOADING → ROOM_IN_MATCH
 */

import {
    type ClientSession,
    buildEventMessage,
    buildSnapshot,
    send,
} from '../protocol/index.js';

import { Match, type Seat } from '../match/index.js';

// =============================================================================
// Types
// =============================================================================

export type RoomPhase =
    | 'ROOM_OPEN'
    | 'ROOM_READY_CHECK'
    | 'ROOM_LOADING'
    | 'ROOM_IN_MATCH'
    | 'ROOM_POST_MATCH'
    | 'ROOM_CLOSED';

export interface PlayerState {
    playerId: string;
    displayName: string;
    ready: boolean;
    loaded: boolean;
    joinOrder: number;
}

export interface RoomState {
    roomId: string;
    inviteCode: string;
    phase: RoomPhase;
    eventSeq: number;
    eventLog: EventLogEntry[];
    players: Map<string, PlayerState>;
    sessions: Map<string, ClientSession>; // playerId -> session
    hostPlayerId: string;
    loadingTimer?: ReturnType<typeof setTimeout>;
    joinCounter: number;
    match?: Match; // Active match when in ROOM_IN_MATCH
}

interface EventLogEntry {
    event_seq: number;
    type: string;
    payload: Record<string, unknown>;
}

// =============================================================================
// Room Registry
// =============================================================================

const rooms = new Map<string, RoomState>();
const inviteCodeToRoom = new Map<string, string>();
const MAX_EVENT_LOG_SIZE = 100;
const LOADING_TIMEOUT_MS = 30_000;
const MAX_PLAYERS = 3;

// =============================================================================
// Helpers
// =============================================================================

function generateRoomId(): string {
    return `room_${Math.random().toString(36).substring(2, 8)}`;
}

function generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function generateDisplayName(playerId: string): string {
    return `Player ${playerId.replace('p_', '')}`;
}

// =============================================================================
// Room Operations
// =============================================================================

export function createRoom(session: ClientSession): RoomState {
    const roomId = generateRoomId();
    const inviteCode = generateInviteCode();

    const playerState: PlayerState = {
        playerId: session.playerId,
        displayName: generateDisplayName(session.playerId),
        ready: false,
        loaded: false,
        joinOrder: 1,
    };

    const room: RoomState = {
        roomId,
        inviteCode,
        phase: 'ROOM_OPEN',
        eventSeq: 0,
        eventLog: [],
        players: new Map([[session.playerId, playerState]]),
        sessions: new Map([[session.playerId, session]]),
        hostPlayerId: session.playerId,
        joinCounter: 1,
    };

    rooms.set(roomId, room);
    inviteCodeToRoom.set(inviteCode, roomId);
    session.roomId = roomId;

    console.log(`[Rooms] Created room ${roomId} (${inviteCode}) - host: ${session.playerId}`);
    return room;
}

export function joinRoom(
    session: ClientSession,
    roomIdOrCode: string
): { room: RoomState | null; error?: string } {
    // Try as room ID first, then as invite code
    let room = rooms.get(roomIdOrCode);
    if (!room) {
        const roomId = inviteCodeToRoom.get(roomIdOrCode.toUpperCase());
        if (roomId) {
            room = rooms.get(roomId);
        }
    }

    if (!room) {
        return { room: null, error: 'ROOM_NOT_FOUND' };
    }

    // Check phase
    if (room.phase !== 'ROOM_OPEN' && room.phase !== 'ROOM_READY_CHECK') {
        return { room: null, error: 'ROOM_NOT_JOINABLE' };
    }

    // Check capacity
    if (room.players.size >= MAX_PLAYERS) {
        return { room: null, error: 'ROOM_FULL' };
    }

    // Add player
    room.joinCounter++;
    const playerState: PlayerState = {
        playerId: session.playerId,
        displayName: generateDisplayName(session.playerId),
        ready: false,
        loaded: false,
        joinOrder: room.joinCounter,
    };

    room.players.set(session.playerId, playerState);
    room.sessions.set(session.playerId, session);
    session.roomId = room.roomId;

    console.log(`[Rooms] ${session.playerId} joined room ${room.roomId} (${room.players.size}/${MAX_PLAYERS})`);
    return { room };
}

export function leaveRoom(session: ClientSession): RoomState | null {
    if (!session.roomId) return null;

    const room = rooms.get(session.roomId);
    if (!room) return null;

    room.players.delete(session.playerId);
    room.sessions.delete(session.playerId);
    session.roomId = null;

    console.log(`[Rooms] ${session.playerId} left room ${room.roomId}`);

    // If room is empty, destroy it
    if (room.players.size === 0) {
        if (room.loadingTimer) clearTimeout(room.loadingTimer);
        rooms.delete(room.roomId);
        inviteCodeToRoom.delete(room.inviteCode);
        console.log(`[Rooms] Destroyed empty room ${room.roomId}`);
        return null;
    }

    // Reassign host if needed
    if (room.hostPlayerId === session.playerId) {
        // Find player with lowest join order
        let newHost: PlayerState | null = null;
        for (const player of room.players.values()) {
            if (!newHost || player.joinOrder < newHost.joinOrder) {
                newHost = player;
            }
        }
        if (newHost) {
            room.hostPlayerId = newHost.playerId;
            console.log(`[Rooms] New host: ${room.hostPlayerId}`);
        }
    }

    // If we were in ready check and someone left, go back to ROOM_OPEN
    if (room.phase === 'ROOM_READY_CHECK') {
        room.phase = 'ROOM_OPEN';
        // Reset ready states
        for (const player of room.players.values()) {
            player.ready = false;
        }
    }

    return room;
}

export function getRoom(roomId: string): RoomState | undefined {
    return rooms.get(roomId);
}

// =============================================================================
// Ready Check Flow
// =============================================================================

export function startReadyCheck(room: RoomState, playerId: string): boolean {
    // Only host can start
    if (room.hostPlayerId !== playerId) {
        return false;
    }

    // Need 3 players
    if (room.players.size < MAX_PLAYERS) {
        return false;
    }

    // Must be in ROOM_OPEN
    if (room.phase !== 'ROOM_OPEN') {
        return false;
    }

    room.phase = 'ROOM_READY_CHECK';

    // Reset all ready states
    for (const player of room.players.values()) {
        player.ready = false;
    }

    console.log(`[Rooms] Ready check started in ${room.roomId}`);
    return true;
}

export function cancelReadyCheck(room: RoomState, playerId: string): boolean {
    // Only host can cancel
    if (room.hostPlayerId !== playerId) {
        return false;
    }

    if (room.phase !== 'ROOM_READY_CHECK') {
        return false;
    }

    room.phase = 'ROOM_OPEN';

    // Reset ready states
    for (const player of room.players.values()) {
        player.ready = false;
    }

    console.log(`[Rooms] Ready check canceled in ${room.roomId}`);
    return true;
}

export function setReady(room: RoomState, playerId: string, ready: boolean): boolean {
    const player = room.players.get(playerId);
    if (!player) return false;

    // Can only set ready during ROOM_OPEN (if 3 players) or ROOM_READY_CHECK
    if (room.phase === 'ROOM_OPEN' && room.players.size === MAX_PLAYERS) {
        // Auto-start ready check if not already
        room.phase = 'ROOM_READY_CHECK';
    }

    if (room.phase !== 'ROOM_READY_CHECK') {
        return false;
    }

    player.ready = ready;
    console.log(`[Rooms] ${playerId} ready=${ready} in ${room.roomId}`);

    // Check if all ready → transition to ROOM_LOADING
    if (checkAllReady(room)) {
        transitionToLoading(room);
    }

    return true;
}

function checkAllReady(room: RoomState): boolean {
    if (room.players.size !== MAX_PLAYERS) return false;
    for (const player of room.players.values()) {
        if (!player.ready) return false;
    }
    return true;
}

function transitionToLoading(room: RoomState): void {
    room.phase = 'ROOM_LOADING';

    // Reset loaded states
    for (const player of room.players.values()) {
        player.loaded = false;
    }

    // Start loading timer
    room.loadingTimer = setTimeout(() => {
        if (room.phase === 'ROOM_LOADING') {
            console.log(`[Rooms] Loading timeout in ${room.roomId}, proceeding to match`);
            transitionToMatch(room);
        }
    }, LOADING_TIMEOUT_MS);

    console.log(`[Rooms] ${room.roomId} → ROOM_LOADING`);

    // Emit loading begin event
    emitEvent(room, 'MATCH_LOADING_BEGIN', {
        asset_manifest_version: 'am_0.1.0',
    });
}

export function setClientLoaded(room: RoomState, playerId: string): boolean {
    if (room.phase !== 'ROOM_LOADING') return false;

    const player = room.players.get(playerId);
    if (!player) return false;

    player.loaded = true;
    console.log(`[Rooms] ${playerId} loaded in ${room.roomId}`);

    // Check if all loaded
    if (checkAllLoaded(room)) {
        if (room.loadingTimer) {
            clearTimeout(room.loadingTimer);
            room.loadingTimer = undefined;
        }
        transitionToMatch(room);
    }

    return true;
}

function checkAllLoaded(room: RoomState): boolean {
    for (const player of room.players.values()) {
        if (!player.loaded) return false;
    }
    return true;
}

function transitionToMatch(room: RoomState): void {
    room.phase = 'ROOM_IN_MATCH';
    console.log(`[Rooms] ${room.roomId} → ROOM_IN_MATCH`);

    // Assign seats
    const seatAssignments = assignSeats(room);

    // Create Match
    room.match = new Match(seatAssignments as Record<Seat, string>);

    // Start first round
    const round = room.match.startNextRound();

    // Emit MATCH_STARTED
    emitEvent(room, 'MATCH_STARTED', {
        match_id: room.match.match_id,
        seats: seatAssignments,
    });

    // Emit ROUND_STARTED
    emitEvent(room, 'ROUND_STARTED', {
        round_id: round.round_id,
        round_index: round.round_index,
        starting_seat: round.starting_seat,
        active_seat: round.active_seat,
        draw_pile_count: round.draw_pile_count,
        hand_counts: round.getHandCounts(),
    });

    // Send private hands to each player
    for (const [seat, playerId] of Object.entries(seatAssignments)) {
        const session = room.sessions.get(playerId);
        if (session) {
            const handSnapshot = buildEventMessage(room.roomId, 'HAND_SNAPSHOT', room.eventSeq, {
                hand: round.getPrivateHand(seat as Seat),
            });
            send(session.ws, handSnapshot);
        }
    }

    // Start first turn
    round.startTurn();
    emitEvent(room, 'TURN_STARTED', {
        active_seat: round.active_seat,
        turn_number: round.turn_number,
    });
}

function assignSeats(room: RoomState): Record<string, string> {
    const players = Array.from(room.players.values())
        .sort((a, b) => a.joinOrder - b.joinOrder);

    const seats = ['LEFT', 'RIGHT', 'INDEP'];
    const result: Record<string, string> = {};

    players.forEach((player, idx) => {
        result[seats[idx]] = player.playerId;
    });

    return result;
}

// =============================================================================
// Event Emission
// =============================================================================

export function emitEvent(
    room: RoomState,
    type: string,
    payload: Record<string, unknown>
): void {
    room.eventSeq++;
    const event = buildEventMessage(room.roomId, type, room.eventSeq, payload);

    // Add to log
    room.eventLog.push({ event_seq: room.eventSeq, type, payload });
    if (room.eventLog.length > MAX_EVENT_LOG_SIZE) {
        room.eventLog.shift();
    }

    // Broadcast to all players
    for (const session of room.sessions.values()) {
        send(session.ws, event);
        session.lastEventSeq = room.eventSeq;
    }
}

// =============================================================================
// ROOM_STATE Broadcast
// =============================================================================

export function broadcastRoomState(room: RoomState): void {
    const playerList = Array.from(room.players.values()).map(p => ({
        player_id: p.playerId,
        display_name: p.displayName,
        ready: p.ready,
        loaded: p.loaded,
        is_host: p.playerId === room.hostPlayerId,
    }));

    emitEvent(room, 'ROOM_STATE', {
        room_phase: room.phase,
        invite_code: room.inviteCode,
        players: playerList,
        host_player_id: room.hostPlayerId,
        player_count: room.players.size,
        max_players: MAX_PLAYERS,
    });
}

// =============================================================================
// Snapshot
// =============================================================================

export function sendSnapshot(session: ClientSession, room: RoomState): void {
    const playerList = Array.from(room.players.values()).map(p => ({
        player_id: p.playerId,
        display_name: p.displayName,
        ready: p.ready,
        loaded: p.loaded,
        is_host: p.playerId === room.hostPlayerId,
    }));

    const snapshot = buildSnapshot(room.roomId, room.eventSeq, {
        room_phase: room.phase,
        invite_code: room.inviteCode,
        players: playerList,
        host_player_id: room.hostPlayerId,
        your_player_id: session.playerId,
        player_count: room.players.size,
        max_players: MAX_PLAYERS,
    });

    send(session.ws, snapshot);
    session.lastEventSeq = room.eventSeq;
}

export function replayEvents(
    session: ClientSession,
    room: RoomState,
    fromSeq: number
): boolean {
    const missingEvents = room.eventLog.filter(e => e.event_seq > fromSeq);

    if (missingEvents.length === 0 && fromSeq < room.eventSeq) {
        return false; // Gap too large
    }

    for (const entry of missingEvents) {
        const event = buildEventMessage(room.roomId, entry.type, entry.event_seq, entry.payload);
        send(session.ws, event);
    }

    session.lastEventSeq = room.eventSeq;
    return true;
}
