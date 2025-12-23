/**
 * MANDATE Game Server
 * Full lobby lifecycle with room management
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '@mandate/shared';
import type { HelloMessage, IntentMessage, Message } from '@mandate/shared';

import {
    type ClientSession,
    type MessageRouter,
    routeMessage,
    buildEventMessage,
    buildAck,
    buildPing,
    buildError,
    send,
} from './protocol/index.js';

import {
    createRoom,
    joinRoom,
    leaveRoom,
    getRoom,
    startReadyCheck,
    cancelReadyCheck,
    setReady,
    setClientLoaded,
    emitEvent,
    sendSnapshot,
    replayEvents,
    broadcastRoomState,
} from './rooms/index.js';

import type { Seat } from './match/index.js';
import { selectAutoPlay, selectAutoCrisis } from './autoAction.js';

// =============================================================================
// Configuration
// =============================================================================

const PORT = parseInt(process.env.PORT || '3001', 10);
const PING_INTERVAL_MS = 10_000;
const PONG_TIMEOUT_MS = 30_000;
const RECONNECT_GRACE_MS = 45_000; // 45 seconds grace period
const TURN_TIMEOUT_MS = 25_000; // 25 seconds per turn

// =============================================================================
// Connection State Types
// =============================================================================

type ConnectionState = 'CONNECTED' | 'DISCONNECTED_GRACE' | 'FORFEITED';

// =============================================================================
// Timer Maps
// =============================================================================

const graceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const turnTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const connectionStates: Map<string, ConnectionState> = new Map();

// =============================================================================
// Session Management
// =============================================================================

const sessions = new Map<WebSocket, ClientSession>();
let playerCounter = 0;

function createSession(ws: WebSocket): ClientSession {
    const playerId = `p_${String(++playerCounter).padStart(2, '0')}`;
    const session: ClientSession = {
        playerId,
        ws,
        roomId: null,
        lastEventSeq: 0,
        lastPongTime: Date.now(),
        intentCache: new Map(),
    };
    sessions.set(ws, session);
    return session;
}

function removeSession(ws: WebSocket): void {
    const session = sessions.get(ws);
    if (!session) return;

    // If in a match, start grace timer instead of immediately leaving
    if (session.roomId) {
        const room = getRoom(session.roomId);
        if (room && room.match) {
            handleDisconnect(session, room);
            return;
        }

        // Not in match - leave room normally
        const leftRoom = leaveRoom(session);
        if (leftRoom) {
            broadcastRoomState(leftRoom);
        }
    }

    sessions.delete(ws);
    console.log(`[Server] Session removed: ${session.playerId}`);
}

function handleDisconnect(session: ClientSession, room: ReturnType<typeof getRoom>): void {
    if (!room) return;

    const playerId = session.playerId;
    const seat = room.match?.getSeatForPlayer(playerId);

    connectionStates.set(playerId, 'DISCONNECTED_GRACE');
    console.log(`[Server] ${playerId} disconnected, starting ${RECONNECT_GRACE_MS / 1000}s grace period`);

    // Emit PLAYER_DISCONNECTED
    if (seat) {
        emitEvent(room, 'PLAYER_DISCONNECTED', { seat });
    }

    // Start grace timer
    const timer = setTimeout(() => {
        handleGraceExpiry(playerId, room);
    }, RECONNECT_GRACE_MS);

    graceTimers.set(playerId, timer);
}

function handleGraceExpiry(playerId: string, room: ReturnType<typeof getRoom>): void {
    if (!room || !room.match) return;

    const currentState = connectionStates.get(playerId);
    if (currentState !== 'DISCONNECTED_GRACE') return;

    connectionStates.set(playerId, 'FORFEITED');
    graceTimers.delete(playerId);

    const seat = room.match.getSeatForPlayer(playerId);
    console.log(`[Server] ${playerId} (${seat}) forfeited due to disconnect`);

    // Emit PLAYER_FORFEITED
    if (seat) {
        emitEvent(room, 'PLAYER_FORFEITED', { seat, reason: 'DISCONNECT_TIMEOUT' });
    }

    // Determine winner and emit MATCH_RESULT
    const winner = determineWinnerOnForfeit(room, seat ?? undefined);
    emitEvent(room, 'MATCH_RESULT', { winner, reason: 'FORFEIT' });

    // Clean up session
    const session = [...sessions.values()].find(s => s.playerId === playerId);
    if (session) {
        sessions.delete(session.ws);
    }
}

function handlePlayerReconnect(session: ClientSession, room: ReturnType<typeof getRoom>): void {
    if (!room) return;

    const playerId = session.playerId;

    // Cancel grace timer if running
    const timer = graceTimers.get(playerId);
    if (timer) {
        clearTimeout(timer);
        graceTimers.delete(playerId);
    }

    // Restore connection state
    connectionStates.set(playerId, 'CONNECTED');

    const seat = room.match?.getSeatForPlayer(playerId);
    console.log(`[Server] ${playerId} (${seat}) reconnected`);

    // Emit PLAYER_RECONNECTED
    if (seat) {
        emitEvent(room, 'PLAYER_RECONNECTED', { seat });
    }
}

function determineWinnerOnForfeit(room: ReturnType<typeof getRoom>, forfeitedSeat: Seat | undefined): Seat {
    if (!room || !room.match || !forfeitedSeat) return 'LEFT';

    const round = room.match.current_round;
    const seats: Seat[] = ['LEFT', 'RIGHT', 'INDEP'];
    const remainingSeats = seats.filter(s => s !== forfeitedSeat);

    // Determine winner by round wins, then districts claimed
    let winner = remainingSeats[0];
    let maxScore = 0;
    let maxDistricts = 0;

    for (const seat of remainingSeats) {
        const roundWins = room.match.match_score[seat];
        const districts = round?.claimed_counts[seat] || 0;

        if (roundWins > maxScore || (roundWins === maxScore && districts > maxDistricts)) {
            winner = seat;
            maxScore = roundWins;
            maxDistricts = districts;
        }
    }

    return winner;
}

// =============================================================================
// Turn Timer
// =============================================================================

function startTurnTimer(room: ReturnType<typeof getRoom>, seat: Seat): void {
    if (!room || !room.match || !room.match.current_round) return;

    const timerKey = `${room.roomId}:turn`;

    // Clear existing timer
    const existing = turnTimers.get(timerKey);
    if (existing) {
        clearTimeout(existing);
    }

    const timer = setTimeout(() => {
        turnTimers.delete(timerKey);
        handleTurnTimeout(room, seat);
    }, TURN_TIMEOUT_MS);

    turnTimers.set(timerKey, timer);
}

function clearTurnTimer(room: ReturnType<typeof getRoom>): void {
    if (!room) return;

    const timerKey = `${room.roomId}:turn`;
    const timer = turnTimers.get(timerKey);
    if (timer) {
        clearTimeout(timer);
        turnTimers.delete(timerKey);
    }
}

function handleTurnTimeout(room: ReturnType<typeof getRoom>, seat: Seat): void {
    if (!room || !room.match || !room.match.current_round) return;

    const round = room.match.current_round;

    // Check if still this player's turn
    if (round.active_seat !== seat || round.phase !== 'TURN_AWAIT_ACTION') {
        return;
    }

    console.log(`[Server] Turn timeout for ${seat}, selecting auto-action`);

    // Select auto-action
    const action = selectAutoPlay(round, seat);

    if (action.type === 'PASS') {
        // Auto-pass: just advance turn
        console.log(`[Server] No legal plays for ${seat}, auto-passing`);
        autoAdvanceTurn(room, seat);
        return;
    }

    // Auto-play
    console.log(`[Server] Auto-playing: ${action.card_def_id} to ${action.district_id}[${action.slot_index}]`);
    executeAutoPlay(room, seat, action);
}

function executeAutoPlay(
    room: ReturnType<typeof getRoom>,
    seat: Seat,
    action: { card_instance_id: string; district_id: string; slot_index: number }
): void {
    if (!room || !room.match || !room.match.current_round) return;

    const round = room.match.current_round;

    // Play the card
    const card = round.playCard(
        seat,
        action.card_instance_id,
        action.district_id,
        action.slot_index
    );

    if (!card) {
        autoAdvanceTurn(room, seat);
        return;
    }

    // Handle crisis card auto-declaration
    if (card.kind === 'CRISIS') {
        const crisis = selectAutoCrisis();
        round.declareCrisis(seat, crisis.declared_color as any, crisis.declared_value as any);

        emitEvent(room, 'CRISIS_DECLARED', {
            seat,
            card_instance_id: action.card_instance_id,
            declared_color: crisis.declared_color,
            declared_value: crisis.declared_value,
            source: 'AUTO',
        });
    }

    // Emit CARD_PLAYED with source: AUTO
    const district = round.getDistrict(action.district_id);
    const placedCard = district?.sides[seat].slots[action.slot_index];

    emitEvent(room, 'CARD_PLAYED', {
        seat,
        source: 'AUTO',
        district_id: action.district_id,
        slot_index: action.slot_index,
        card: placedCard ? {
            card_instance_id: placedCard.card_instance_id,
            card_def_id: placedCard.card_def_id,
            kind: placedCard.kind,
            asset_color: placedCard.asset_color,
            asset_value: placedCard.asset_value,
            crisis_state: placedCard.crisis_state,
        } : null,
        hand_counts: round.getHandCounts(),
    });

    // Resolve claims
    round.phase = 'TURN_CLAIM_CHECK';
    const claimResults = round.resolveAllClaims();
    for (const result of claimResults) {
        emitEvent(room, 'DISTRICT_CLAIMED', {
            district_id: result.district_id,
            winner: result.winner,
            winning_config: {
                type: result.winning_config.type,
                rank: result.winning_config.rank,
                total_value: result.winning_config.total_value,
            },
            claimed_counts: round.claimed_counts,
        });
    }

    // Check round end
    const roundWinner = round.checkRoundEnd();
    if (roundWinner) {
        // Record round result
        room.match.endRound(roundWinner);

        emitEvent(room, 'ROUND_ENDED', {
            winner: roundWinner,
            claimed_counts: round.claimed_counts,
            match_score: room.match.match_score,
        });

        // Check if match is over
        const matchResult = room.match.checkMatchEnd();
        if (matchResult) {
            emitEvent(room, 'MATCH_ENDED', {
                winner: matchResult.winner,
                match_score: matchResult.match_score,
                tiebreak: matchResult.tiebreak,
            });
            // TODO: Return players to lobby or handle match end
            return;
        }

        // Start next round after a brief delay (allow clients to see results)
        setTimeout(() => {
            if (!room.match) return;
            const newRound = room.match.startNextRound();

            // Round constructor already deals cards, so we just emit events
            emitEvent(room, 'ROUND_STARTED', {
                round_number: room.match.round_index,
                starting_seat: newRound.active_seat,
                hands: Object.fromEntries(
                    ['LEFT', 'RIGHT', 'INDEP'].map(s => [s, newRound.getHand(s as Seat)])
                ),
                draw_pile_count: newRound.draw_pile_count,
            });

            // Start first turn
            emitEvent(room, 'TURN_STARTED', {
                seat: newRound.active_seat,
                turn_number: 1,
            });
        }, 2000); // 2 second delay between rounds

        return;
    }

    // Draw + advance
    autoAdvanceTurn(room, seat);
}

function autoAdvanceTurn(room: ReturnType<typeof getRoom>, seat: Seat): void {
    if (!room || !room.match || !room.match.current_round) return;

    const round = room.match.current_round;

    // Draw phase
    round.phase = 'TURN_DRAW';
    round.drawCard(seat);

    emitEvent(room, 'CARD_DRAWN', {
        seat,
        source: 'AUTO',
        draw_pile_count: round.draw_pile_count,
        hand_counts: round.getHandCounts(),
    });

    // End turn
    round.phase = 'TURN_END';
    emitEvent(room, 'TURN_ENDED', {
        seat,
        source: 'AUTO',
        turn_number: round.turn_number,
    });

    // Start next turn
    round.advanceTurn();
    round.startTurn();
    emitEvent(room, 'TURN_STARTED', {
        active_seat: round.active_seat,
        turn_number: round.turn_number,
    });

    // Start turn timer for next player
    startTurnTimer(room, round.active_seat);
}

// =============================================================================
// Intent Handlers
// =============================================================================

function handleCreateRoom(session: ClientSession, message: IntentMessage): void {
    const cached = session.intentCache.get(message.client_intent_id);
    if (cached) {
        send(session.ws, cached);
        return;
    }

    // Leave current room if any
    if (session.roomId) {
        const oldRoom = leaveRoom(session);
        if (oldRoom) broadcastRoomState(oldRoom);
    }

    const room = createRoom(session);
    const ack = buildAck(room.roomId, message.client_intent_id, true);
    session.intentCache.set(message.client_intent_id, ack);
    send(session.ws, ack);

    // Send snapshot and room state
    sendSnapshot(session, room);
    broadcastRoomState(room);
}

function handleJoinRoom(session: ClientSession, message: IntentMessage): void {
    const cached = session.intentCache.get(message.client_intent_id);
    if (cached) {
        send(session.ws, cached);
        return;
    }

    // Leave current room if any
    if (session.roomId) {
        const oldRoom = leaveRoom(session);
        if (oldRoom) broadcastRoomState(oldRoom);
    }

    const payload = message.payload as { room_id?: string; invite_code?: string };
    const roomIdOrCode = payload.room_id || payload.invite_code || '';

    const { room, error } = joinRoom(session, roomIdOrCode);

    if (!room) {
        const ack = buildAck(null, message.client_intent_id, false, error as any, 'Room not found or full');
        session.intentCache.set(message.client_intent_id, ack);
        send(session.ws, ack);
        return;
    }

    const ack = buildAck(room.roomId, message.client_intent_id, true);
    session.intentCache.set(message.client_intent_id, ack);
    send(session.ws, ack);

    // Send snapshot to new player
    sendSnapshot(session, room);

    // Broadcast updated room state to all
    broadcastRoomState(room);
}

function handleLeaveRoom(session: ClientSession, message: IntentMessage): void {
    const cached = session.intentCache.get(message.client_intent_id);
    if (cached) {
        send(session.ws, cached);
        return;
    }

    const roomId = session.roomId;
    const room = leaveRoom(session);

    const ack = buildAck(roomId, message.client_intent_id, true);
    session.intentCache.set(message.client_intent_id, ack);
    send(session.ws, ack);

    if (room) {
        broadcastRoomState(room);
    }
}

function handleStartReadyCheck(session: ClientSession, message: IntentMessage): void {
    const cached = session.intentCache.get(message.client_intent_id);
    if (cached) {
        send(session.ws, cached);
        return;
    }

    if (!session.roomId) {
        const ack = buildAck(null, message.client_intent_id, false, 'ROOM_NOT_FOUND', 'Not in a room');
        send(session.ws, ack);
        return;
    }

    const room = getRoom(session.roomId);
    if (!room) {
        const ack = buildAck(null, message.client_intent_id, false, 'ROOM_NOT_FOUND', 'Room not found');
        send(session.ws, ack);
        return;
    }

    const success = startReadyCheck(room, session.playerId);

    if (!success) {
        const ack = buildAck(room.roomId, message.client_intent_id, false, 'NOT_HOST', 'Only host can start ready check');
        session.intentCache.set(message.client_intent_id, ack);
        send(session.ws, ack);
        return;
    }

    const ack = buildAck(room.roomId, message.client_intent_id, true);
    session.intentCache.set(message.client_intent_id, ack);
    send(session.ws, ack);

    // Emit ready check started event
    emitEvent(room, 'READY_CHECK_STARTED', {});
    broadcastRoomState(room);
}

function handleCancelReadyCheck(session: ClientSession, message: IntentMessage): void {
    const cached = session.intentCache.get(message.client_intent_id);
    if (cached) {
        send(session.ws, cached);
        return;
    }

    if (!session.roomId) {
        const ack = buildAck(null, message.client_intent_id, false, 'ROOM_NOT_FOUND', 'Not in a room');
        send(session.ws, ack);
        return;
    }

    const room = getRoom(session.roomId);
    if (!room) {
        const ack = buildAck(null, message.client_intent_id, false, 'ROOM_NOT_FOUND', 'Room not found');
        send(session.ws, ack);
        return;
    }

    const success = cancelReadyCheck(room, session.playerId);

    if (!success) {
        const ack = buildAck(room.roomId, message.client_intent_id, false, 'NOT_HOST', 'Only host can cancel');
        session.intentCache.set(message.client_intent_id, ack);
        send(session.ws, ack);
        return;
    }

    const ack = buildAck(room.roomId, message.client_intent_id, true);
    session.intentCache.set(message.client_intent_id, ack);
    send(session.ws, ack);

    emitEvent(room, 'READY_CHECK_CANCELED', {});
    broadcastRoomState(room);
}

function handleSetReady(session: ClientSession, message: IntentMessage): void {
    const cached = session.intentCache.get(message.client_intent_id);
    if (cached) {
        send(session.ws, cached);
        return;
    }

    if (!session.roomId) {
        const ack = buildAck(null, message.client_intent_id, false, 'ROOM_NOT_FOUND', 'Not in a room');
        send(session.ws, ack);
        return;
    }

    const room = getRoom(session.roomId);
    if (!room) {
        const ack = buildAck(null, message.client_intent_id, false, 'ROOM_NOT_FOUND', 'Room not found');
        send(session.ws, ack);
        return;
    }

    const payload = message.payload as { ready?: boolean };
    const ready = payload.ready ?? true;

    const success = setReady(room, session.playerId, ready);

    if (!success) {
        const ack = buildAck(room.roomId, message.client_intent_id, false, 'INVALID_PHASE', 'Cannot set ready in current phase');
        session.intentCache.set(message.client_intent_id, ack);
        send(session.ws, ack);
        return;
    }

    const ack = buildAck(room.roomId, message.client_intent_id, true);
    session.intentCache.set(message.client_intent_id, ack);
    send(session.ws, ack);

    broadcastRoomState(room);
}

function handleClientLoaded(session: ClientSession, message: IntentMessage): void {
    const cached = session.intentCache.get(message.client_intent_id);
    if (cached) {
        send(session.ws, cached);
        return;
    }

    if (!session.roomId) {
        const ack = buildAck(null, message.client_intent_id, false, 'ROOM_NOT_FOUND', 'Not in a room');
        send(session.ws, ack);
        return;
    }

    const room = getRoom(session.roomId);
    if (!room) {
        const ack = buildAck(null, message.client_intent_id, false, 'ROOM_NOT_FOUND', 'Room not found');
        send(session.ws, ack);
        return;
    }

    setClientLoaded(room, session.playerId);

    const ack = buildAck(room.roomId, message.client_intent_id, true);
    session.intentCache.set(message.client_intent_id, ack);
    send(session.ws, ack);

    broadcastRoomState(room);
}

function handleRequestSnapshot(session: ClientSession, message: IntentMessage): void {
    if (!session.roomId) {
        const ack = buildAck(null, message.client_intent_id, false, 'ROOM_NOT_FOUND', 'Not in a room');
        send(session.ws, ack);
        return;
    }

    const room = getRoom(session.roomId);
    if (!room) {
        const ack = buildAck(null, message.client_intent_id, false, 'ROOM_NOT_FOUND', 'Room not found');
        send(session.ws, ack);
        return;
    }

    const ack = buildAck(room.roomId, message.client_intent_id, true);
    send(session.ws, ack);

    sendSnapshot(session, room);
}

function handlePlayCard(session: ClientSession, message: IntentMessage): void {
    const cached = session.intentCache.get(message.client_intent_id);
    if (cached) {
        send(session.ws, cached);
        return;
    }

    if (!session.roomId) {
        const ack = buildAck(null, message.client_intent_id, false, 'ROOM_NOT_FOUND', 'Not in a room');
        send(session.ws, ack);
        return;
    }

    const room = getRoom(session.roomId);
    if (!room || !room.match || !room.match.current_round) {
        const ack = buildAck(null, message.client_intent_id, false, 'NO_MATCH', 'No active match');
        send(session.ws, ack);
        return;
    }

    const match = room.match;
    const round = match.current_round!; // Checked above
    const seat = match.getSeatForPlayer(session.playerId);

    if (!seat) {
        const ack = buildAck(room.roomId, message.client_intent_id, false, 'NOT_IN_MATCH', 'Not in this match');
        send(session.ws, ack);
        return;
    }

    const payload = message.payload as {
        card_instance_id: string;
        district_id: string;
        slot_index: number;
    };

    // Validate placement
    const validation = round.validatePlayCard(
        seat,
        payload.card_instance_id,
        payload.district_id,
        payload.slot_index
    );

    if (!validation.valid) {
        console.warn(`[Match] Play validation failed for ${seat}: ${validation.error}`);
        const ack = buildAck(room.roomId, message.client_intent_id, false, validation.error as any, validation.error);
        session.intentCache.set(message.client_intent_id, ack);
        send(session.ws, ack);
        return;
    }

    // Play the card
    const card = round.playCard(
        seat,
        payload.card_instance_id,
        payload.district_id,
        payload.slot_index
    );

    // Clear turn timer - player made a valid move
    clearTurnTimer(room);

    if (!card) {
        const ack = buildAck(room.roomId, message.client_intent_id, false, 'PLAY_FAILED', 'Failed to play card');
        send(session.ws, ack);
        return;
    }

    // Check if crisis card needs declaration
    if (card.kind === 'CRISIS') {
        const ack = buildAck(room.roomId, message.client_intent_id, true);
        session.intentCache.set(message.client_intent_id, ack);
        send(session.ws, ack);

        emitEvent(room, 'CRISIS_DECLARATION_REQUIRED', {
            seat,
            card_instance_id: payload.card_instance_id,
            deadline_ms: Date.now() + 10000,
        });

        // Start crisis timer
        startCrisisTimer(room, seat);
        return;
    }

    // Finalize the play
    finalizePlay(room, session, message, seat, payload);
}

function finalizePlay(
    room: ReturnType<typeof getRoom>,
    session: ClientSession,
    message: IntentMessage,
    seat: Seat,
    payload: { card_instance_id: string; district_id: string; slot_index: number }
): void {
    if (!room || !room.match || !room.match.current_round) return;

    const round = room.match.current_round;
    const district = round.getDistrict(payload.district_id);
    const card = district?.sides[seat].slots[payload.slot_index];

    // ACK the intent
    const ack = buildAck(room.roomId, message.client_intent_id, true);
    session.intentCache.set(message.client_intent_id, ack);
    send(session.ws, ack);

    // Emit CARD_PLAYED event
    emitEvent(room, 'CARD_PLAYED', {
        seat,
        district_id: payload.district_id,
        slot_index: payload.slot_index,
        card: card ? {
            card_instance_id: card.card_instance_id,
            card_def_id: card.card_def_id,
            kind: card.kind,
            asset_color: card.asset_color,
            asset_value: card.asset_value,
            crisis_state: card.crisis_state,
        } : null,
        hand_counts: round.getHandCounts(),
    });

    // Resolve claims using RulesEngine
    round.phase = 'TURN_CLAIM_CHECK';
    const claimResults = round.resolveAllClaims();

    for (const result of claimResults) {
        emitEvent(room, 'DISTRICT_CLAIMED', {
            district_id: result.district_id,
            winner: result.winner,
            winning_config: {
                type: result.winning_config.type,
                rank: result.winning_config.rank,
                total_value: result.winning_config.total_value,
            },
            claimed_counts: round.claimed_counts,
        });
    }

    // Check round end
    const roundWinner = round.checkRoundEnd();
    if (roundWinner) {
        // Record round result
        room.match.endRound(roundWinner);

        emitEvent(room, 'ROUND_ENDED', {
            winner: roundWinner,
            claimed_counts: round.claimed_counts,
            match_score: room.match.match_score,
        });

        // Check if match is over
        const matchResult = room.match.checkMatchEnd();
        if (matchResult) {
            emitEvent(room, 'MATCH_ENDED', {
                winner: matchResult.winner,
                match_score: matchResult.match_score,
                tiebreak: matchResult.tiebreak,
            });
            // TODO: Return players to lobby or handle match end
            return;
        }

        // Start next round after a brief delay (allow clients to see results)
        setTimeout(() => {
            if (!room.match) return;
            const newRound = room.match.startNextRound();

            // Round constructor already deals cards, so we just emit events
            emitEvent(room, 'ROUND_STARTED', {
                round_number: room.match.round_index,
                starting_seat: newRound.active_seat,
                hands: Object.fromEntries(
                    ['LEFT', 'RIGHT', 'INDEP'].map(s => [s, newRound.getHand(s as Seat)])
                ),
                draw_pile_count: newRound.draw_pile_count,
            });

            // Start first turn
            emitEvent(room, 'TURN_STARTED', {
                seat: newRound.active_seat,
                turn_number: 1,
            });
        }, 2000); // 2 second delay between rounds

        return;
    }

    // Draw phase
    round.phase = 'TURN_DRAW';
    const drawnCard = round.drawCard(seat);
    if (drawnCard) {
        // Send private hand update to player
        const handSession = room.sessions.get(room.match.getPlayerIdForSeat(seat));
        if (handSession) {
            const handSnapshot = buildEventMessage(room.roomId, 'HAND_SNAPSHOT', room.eventSeq, {
                hand: round.getPrivateHand(seat),
            });
            send(handSession.ws, handSnapshot);
        }
    }

    emitEvent(room, 'CARD_DRAWN', {
        seat,
        draw_pile_count: round.draw_pile_count,
        hand_counts: round.getHandCounts(),
    });

    // End turn, advance to next player
    round.phase = 'TURN_END';
    emitEvent(room, 'TURN_ENDED', {
        seat,
        turn_number: round.turn_number,
    });

    // Start next turn
    round.advanceTurn();
    round.startTurn();
    emitEvent(room, 'TURN_STARTED', {
        active_seat: round.active_seat,
        turn_number: round.turn_number,
    });
}

// =============================================================================
// Crisis Declaration Handler
// =============================================================================

const CRISIS_TIMEOUT_MS = 10000; // 10 seconds
const crisisTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

function handleDeclareCrisis(session: ClientSession, message: IntentMessage): void {
    const cached = session.intentCache.get(message.client_intent_id);
    if (cached) {
        send(session.ws, cached);
        return;
    }

    if (!session.roomId) {
        const ack = buildAck(null, message.client_intent_id, false, 'ROOM_NOT_FOUND', 'Not in a room');
        send(session.ws, ack);
        return;
    }

    const room = getRoom(session.roomId);
    if (!room || !room.match || !room.match.current_round) {
        const ack = buildAck(null, message.client_intent_id, false, 'NO_MATCH', 'No active match');
        send(session.ws, ack);
        return;
    }

    const match = room.match;
    const round = match.current_round!;
    const seat = match.getSeatForPlayer(session.playerId);

    if (!seat) {
        const ack = buildAck(room.roomId, message.client_intent_id, false, 'NOT_IN_MATCH', 'Not in this match');
        send(session.ws, ack);
        return;
    }

    // Check phase
    if (round.phase !== 'TURN_AWAIT_CRISIS_DECLARATION') {
        const ack = buildAck(room.roomId, message.client_intent_id, false, 'CRISIS_NOT_PENDING', 'No crisis pending');
        send(session.ws, ack);
        return;
    }

    // Check it's the right player
    if (round.active_seat !== seat) {
        const ack = buildAck(room.roomId, message.client_intent_id, false, 'NOT_YOUR_TURN', 'Not your turn');
        send(session.ws, ack);
        return;
    }

    const payload = message.payload as {
        card_instance_id: string;
        declared_color: string;
        declared_value: string;
    };

    // Validate pending crisis matches
    if (!round.pending_crisis || round.pending_crisis.card_instance_id !== payload.card_instance_id) {
        const ack = buildAck(room.roomId, message.client_intent_id, false, 'CRISIS_NOT_PENDING', 'Card mismatch');
        send(session.ws, ack);
        return;
    }

    // Validate value is 2-10 (not Ace)
    const validValues = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
    if (!validValues.includes(payload.declared_value)) {
        const ack = buildAck(room.roomId, message.client_intent_id, false, 'CRISIS_VALUE_NOT_ALLOWED', 'Value must be 2-10');
        send(session.ws, ack);
        return;
    }

    // Validate color
    const validColors = ['INSTITUTION', 'BASE', 'MEDIA', 'CAPITAL', 'IDEOLOGY', 'LOGISTICS'];
    if (!validColors.includes(payload.declared_color)) {
        const ack = buildAck(room.roomId, message.client_intent_id, false, 'CRISIS_DECLARATION_INVALID', 'Invalid color');
        send(session.ws, ack);
        return;
    }

    // Clear crisis timer
    const timerKey = `${room.roomId}:${round.round_id}`;
    const timer = crisisTimers.get(timerKey);
    if (timer) {
        clearTimeout(timer);
        crisisTimers.delete(timerKey);
    }

    // Store pending play info before declaration clears it
    const pendingPlay = {
        district_id: round.pending_crisis.district_id,
        slot_index: round.pending_crisis.slot_index,
    };

    // Apply the declaration
    const success = round.declareCrisis(
        seat,
        payload.declared_color as any,
        payload.declared_value as any
    );

    if (!success) {
        const ack = buildAck(room.roomId, message.client_intent_id, false, 'CRISIS_DECLARATION_INVALID', 'Declaration failed');
        send(session.ws, ack);
        return;
    }

    // ACK the intent
    const ack = buildAck(room.roomId, message.client_intent_id, true);
    session.intentCache.set(message.client_intent_id, ack);
    send(session.ws, ack);

    // Emit CRISIS_DECLARED
    emitEvent(room, 'CRISIS_DECLARED', {
        seat,
        card_instance_id: payload.card_instance_id,
        declared_color: payload.declared_color,
        declared_value: payload.declared_value,
    });

    // Now finalize the play
    finalizeCrisisPlay(room, seat, pendingPlay);
}

function finalizeCrisisPlay(
    room: ReturnType<typeof getRoom>,
    seat: Seat,
    pending: { district_id: string; slot_index: number }
): void {
    if (!room || !room.match || !room.match.current_round) return;

    const round = room.match.current_round;
    const district = round.getDistrict(pending.district_id);
    const card = district?.sides[seat].slots[pending.slot_index];

    // Emit CARD_PLAYED event
    emitEvent(room, 'CARD_PLAYED', {
        seat,
        district_id: pending.district_id,
        slot_index: pending.slot_index,
        card: card ? {
            card_instance_id: card.card_instance_id,
            card_def_id: card.card_def_id,
            kind: card.kind,
            asset_color: card.asset_color,
            asset_value: card.asset_value,
            crisis_state: card.crisis_state,
        } : null,
        hand_counts: round.getHandCounts(),
    });

    // Resolve claims using RulesEngine
    round.phase = 'TURN_CLAIM_CHECK';
    const claimResults = round.resolveAllClaims();

    for (const result of claimResults) {
        emitEvent(room, 'DISTRICT_CLAIMED', {
            district_id: result.district_id,
            winner: result.winner,
            winning_config: {
                type: result.winning_config.type,
                rank: result.winning_config.rank,
                total_value: result.winning_config.total_value,
            },
            claimed_counts: round.claimed_counts,
        });
    }

    // Check round end
    const roundWinner = round.checkRoundEnd();
    if (roundWinner) {
        // Record round result
        room.match.endRound(roundWinner);

        emitEvent(room, 'ROUND_ENDED', {
            winner: roundWinner,
            claimed_counts: round.claimed_counts,
            match_score: room.match.match_score,
        });

        // Check if match is over
        const matchResult = room.match.checkMatchEnd();
        if (matchResult) {
            emitEvent(room, 'MATCH_ENDED', {
                winner: matchResult.winner,
                match_score: matchResult.match_score,
                tiebreak: matchResult.tiebreak,
            });
            return;
        }

        // Start next round after a brief delay
        setTimeout(() => {
            if (!room.match) return;
            const newRound = room.match.startNextRound();

            emitEvent(room, 'ROUND_STARTED', {
                round_number: room.match.round_index,
                starting_seat: newRound.active_seat,
                hands: Object.fromEntries(
                    ['LEFT', 'RIGHT', 'INDEP'].map(s => [s, newRound.getHand(s as Seat)])
                ),
                draw_pile_count: newRound.draw_pile_count,
            });

            emitEvent(room, 'TURN_STARTED', {
                seat: newRound.active_seat,
                turn_number: 1,
            });
        }, 2000);

        return;
    }

    // Draw phase
    round.phase = 'TURN_DRAW';
    const drawnCard = round.drawCard(seat);
    if (drawnCard) {
        const handSession = room.sessions.get(room.match.getPlayerIdForSeat(seat));
        if (handSession) {
            const handSnapshot = buildEventMessage(room.roomId, 'HAND_SNAPSHOT', room.eventSeq, {
                hand: round.getPrivateHand(seat),
            });
            send(handSession.ws, handSnapshot);
        }
    }

    emitEvent(room, 'CARD_DRAWN', {
        seat,
        draw_pile_count: round.draw_pile_count,
        hand_counts: round.getHandCounts(),
    });

    // End turn, advance to next player
    round.phase = 'TURN_END';
    emitEvent(room, 'TURN_ENDED', {
        seat,
        turn_number: round.turn_number,
    });

    // Start next turn
    round.advanceTurn();
    round.startTurn();
    emitEvent(room, 'TURN_STARTED', {
        active_seat: round.active_seat,
        turn_number: round.turn_number,
    });
}

function startCrisisTimer(room: ReturnType<typeof getRoom>, seat: Seat): void {
    if (!room || !room.match || !room.match.current_round) return;

    const round = room.match.current_round;
    const timerKey = `${room.roomId}:${round.round_id}`;

    // Clear any existing timer
    const existingTimer = crisisTimers.get(timerKey);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
        crisisTimers.delete(timerKey);
        autoDeclare(room, seat);
    }, CRISIS_TIMEOUT_MS);

    crisisTimers.set(timerKey, timer);
}

function autoDeclare(room: ReturnType<typeof getRoom>, seat: Seat): void {
    if (!room || !room.match || !room.match.current_round) return;

    const round = room.match.current_round;

    if (round.phase !== 'TURN_AWAIT_CRISIS_DECLARATION' || !round.pending_crisis) {
        return;
    }

    // Deterministic auto-declare: pick first color and value 5
    const autoColor = 'INSTITUTION';
    const autoValue = '5';

    const success = round.declareCrisis(seat, autoColor as any, autoValue as any);
    if (!success) return;

    // Emit CRISIS_DECLARED
    emitEvent(room, 'CRISIS_DECLARED', {
        seat,
        card_instance_id: round.pending_crisis?.card_instance_id || '',
        declared_color: autoColor,
        declared_value: autoValue,
        auto_declared: true,
    });

    // Finalize play
    finalizeCrisisPlay(room, seat, {
        district_id: round.pending_play?.district_id || '',
        slot_index: round.pending_play?.slot_index || 0,
    });
}

// =============================================================================
// Message Router
// =============================================================================

const router: MessageRouter = {
    onHello(session: ClientSession, message: HelloMessage) {
        console.log(`[Server] HELLO from ${session.playerId}`);

        // Check for resume (reconnect)
        const resume = message.payload.resume;
        if (resume?.room_id) {
            const room = getRoom(resume.room_id);
            if (room && room.sessions.has(session.playerId)) {
                // Handle reconnection
                handlePlayerReconnect(session, room);

                const replayed = replayEvents(session, room, resume.last_event_seq);
                if (!replayed) {
                    sendSnapshot(session, room);
                }

                // Send private hand
                if (room.match && room.match.current_round) {
                    const seat = room.match.getSeatForPlayer(session.playerId);
                    if (seat) {
                        const handSnapshot = buildEventMessage(room.roomId, 'HAND_SNAPSHOT', room.eventSeq, {
                            hand: room.match.current_round.getPrivateHand(seat),
                        });
                        send(session.ws, handSnapshot);
                    }
                }
            }
        }

        // Send HELLO_OK
        const helloOk = buildEventMessage(session.roomId, 'HELLO_OK', 0, {
            player_id: session.playerId,
            server_time_ms: Date.now(),
        });
        send(session.ws, helloOk);
    },

    onIntent(session: ClientSession, message: IntentMessage) {
        console.log(`[Server] INTENT ${message.type} from ${session.playerId}`);

        switch (message.type) {
            case 'CREATE_ROOM':
                handleCreateRoom(session, message);
                break;
            case 'JOIN_ROOM':
                handleJoinRoom(session, message);
                break;
            case 'LEAVE_ROOM':
                handleLeaveRoom(session, message);
                break;
            case 'START_READY_CHECK':
                handleStartReadyCheck(session, message);
                break;
            case 'CANCEL_READY_CHECK':
                handleCancelReadyCheck(session, message);
                break;
            case 'SET_READY':
                handleSetReady(session, message);
                break;
            case 'CLIENT_LOADED':
                handleClientLoaded(session, message);
                break;
            case 'REQUEST_SNAPSHOT':
                handleRequestSnapshot(session, message);
                break;
            case 'PLAY_CARD':
                handlePlayCard(session, message);
                break;
            case 'DECLARE_CRISIS':
                handleDeclareCrisis(session, message);
                break;
            default:
                // Unknown intent - just accept for now
                const ack = buildAck(session.roomId, message.client_intent_id, true);
                send(session.ws, ack);
        }
    },

    onPong(session: ClientSession) {
        session.lastPongTime = Date.now();
    },

    onUnknown(session: ClientSession, message: Message) {
        console.log(`[Server] Unknown op: ${message.op}`);
        send(session.ws, buildError('UNKNOWN_OP', `Unknown operation: ${message.op}`));
    },
};

// =============================================================================
// Static File Serving (Production)
// =============================================================================

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
};

// Resolve client dist path
// When running via workspace, CWD is /app/server, so we need to go up one level
const CLIENT_DIST_PATH = join(process.cwd(), '..', 'client', 'dist');

function serveStaticFile(req: IncomingMessage, res: ServerResponse): void {
    let filePath = req.url || '/';

    // Remove query string
    filePath = filePath.split('?')[0];

    // Default to index.html
    if (filePath === '/') {
        filePath = '/index.html';
    }

    const fullPath = join(CLIENT_DIST_PATH, filePath);

    // Security: prevent directory traversal
    if (!fullPath.startsWith(CLIENT_DIST_PATH)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // Check if file exists
    if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
        // SPA fallback: serve index.html for non-file routes
        const indexPath = join(CLIENT_DIST_PATH, 'index.html');
        if (existsSync(indexPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(readFileSync(indexPath));
            return;
        }
        res.writeHead(404);
        res.end('Not Found');
        return;
    }

    // Serve the file
    const ext = extname(fullPath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(readFileSync(fullPath));
}

// =============================================================================
// HTTP + WebSocket Server
// =============================================================================

const httpServer = createServer((req, res) => {
    // Health check endpoints (Railway checks /)
    if (req.url === '/health' || req.url === '/') {
        // Check if we have client files
        const indexPath = join(CLIENT_DIST_PATH, 'index.html');
        if (req.url === '/' && existsSync(indexPath)) {
            // Serve the actual index.html if it exists
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(readFileSync(indexPath));
            return;
        }
        // Return health check response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', protocol: PROTOCOL_VERSION }));
        return;
    }

    // Serve static files
    serveStaticFile(req, res);
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws: WebSocket) => {
    const session = createSession(ws);
    console.log(`[Server] New connection: ${session.playerId}`);

    ws.on('message', (data: Buffer) => {
        routeMessage(router, session, data.toString());
    });

    ws.on('close', () => {
        console.log(`[Server] Connection closed: ${session.playerId}`);
        removeSession(ws);
    });

    ws.on('error', (err) => {
        console.error(`[Server] WebSocket error for ${session.playerId}:`, err.message);
    });
});

// =============================================================================
// Heartbeat
// =============================================================================

setInterval(() => {
    const now = Date.now();
    const ping = buildPing();

    for (const [ws, session] of sessions) {
        if (now - session.lastPongTime > PONG_TIMEOUT_MS) {
            console.log(`[Server] PONG timeout for ${session.playerId}, disconnecting`);
            ws.close();
            continue;
        }

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(ping));
        }
    }
}, PING_INTERVAL_MS);

// =============================================================================
// Startup
// =============================================================================

httpServer.listen(PORT, () => {
    console.log(`[Server] HTTP + WebSocket server running on port ${PORT}`);
    console.log(`[Server] Static files: ${CLIENT_DIST_PATH}`);
    console.log(`[Server] Client dist exists: ${existsSync(CLIENT_DIST_PATH)}`);
    console.log(`[Server] Index.html exists: ${existsSync(join(CLIENT_DIST_PATH, 'index.html'))}`);
    console.log(`[Server] CWD: ${process.cwd()}`);
    console.log(`[Server] Protocol version: ${PROTOCOL_VERSION}`);
    console.log(`[Server] Heartbeat: PING every ${PING_INTERVAL_MS / 1000}s, timeout ${PONG_TIMEOUT_MS / 1000}s`);
});

