/**
 * LobbyStore - Client-side room state management
 * Receives ROOM_STATE events and SNAPSHOT messages to maintain current state
 */

import type { EventMessage, SnapshotMessage } from '@mandate/shared';

// =============================================================================
// Types
// =============================================================================

export type RoomPhase =
    | 'ROOM_OPEN'
    | 'ROOM_READY_CHECK'
    | 'ROOM_LOADING'
    | 'ROOM_IN_MATCH'
    | 'ROOM_POST_MATCH';

export interface PlayerInfo {
    player_id: string;
    display_name: string;
    ready: boolean;
    loaded?: boolean;
    is_host: boolean;
}

export interface RoomInfo {
    room_phase: RoomPhase;
    invite_code: string;
    players: PlayerInfo[];
    host_player_id: string;
    player_count: number;
    max_players: number;
}

export type LobbyStateCallback = (state: LobbyState) => void;

// =============================================================================
// Lobby State
// =============================================================================

export interface LobbyState {
    connected: boolean;
    playerId: string | null;
    inRoom: boolean;
    room: RoomInfo | null;
}

// =============================================================================
// LobbyStore
// =============================================================================

export class LobbyStore {
    private state: LobbyState = {
        connected: false,
        playerId: null,
        inRoom: false,
        room: null,
    };

    private listeners: LobbyStateCallback[] = [];

    // ===========================================================================
    // Public API
    // ===========================================================================

    getState(): LobbyState {
        return { ...this.state };
    }

    setConnected(connected: boolean, playerId: string | null): void {
        this.state.connected = connected;
        this.state.playerId = playerId;
        if (!connected) {
            this.state.inRoom = false;
            this.state.room = null;
        }
        this.notify();
    }

    handleEvent(event: EventMessage): void {
        switch (event.type) {
            case 'ROOM_STATE':
                this.handleRoomState(event.payload as unknown as RoomInfo);
                break;
            case 'MATCH_LOADING_BEGIN':
                if (this.state.room) {
                    this.state.room.room_phase = 'ROOM_LOADING';
                    this.notify();
                }
                break;
            case 'MATCH_STARTED':
                if (this.state.room) {
                    this.state.room.room_phase = 'ROOM_IN_MATCH';
                    this.notify();
                }
                break;
        }
    }

    handleSnapshot(snapshot: SnapshotMessage): void {
        const payload = snapshot.payload as unknown as {
            room_phase: RoomPhase;
            invite_code: string;
            players: PlayerInfo[];
            host_player_id: string;
            your_player_id?: string;
            player_count: number;
            max_players: number;
        };

        this.state.inRoom = true;
        this.state.room = {
            room_phase: payload.room_phase,
            invite_code: payload.invite_code,
            players: payload.players,
            host_player_id: payload.host_player_id,
            player_count: payload.player_count,
            max_players: payload.max_players,
        };
        this.notify();
    }

    leaveRoom(): void {
        this.state.inRoom = false;
        this.state.room = null;
        this.notify();
    }

    subscribe(callback: LobbyStateCallback): () => void {
        this.listeners.push(callback);
        // Immediately call with current state
        callback(this.getState());
        return () => {
            const idx = this.listeners.indexOf(callback);
            if (idx >= 0) this.listeners.splice(idx, 1);
        };
    }

    // ===========================================================================
    // Helpers
    // ===========================================================================

    isHost(): boolean {
        if (!this.state.room || !this.state.playerId) return false;
        return this.state.room.host_player_id === this.state.playerId;
    }

    getMyPlayer(): PlayerInfo | null {
        if (!this.state.room || !this.state.playerId) return null;
        return this.state.room.players.find(p => p.player_id === this.state.playerId) || null;
    }

    // ===========================================================================
    // Private
    // ===========================================================================

    private handleRoomState(roomInfo: RoomInfo): void {
        this.state.inRoom = true;
        this.state.room = roomInfo;
        this.notify();
    }

    private notify(): void {
        const stateCopy = this.getState();
        for (const cb of this.listeners) {
            cb(stateCopy);
        }
    }
}

// Singleton instance
export const lobbyStore = new LobbyStore();
