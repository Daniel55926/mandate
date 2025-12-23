/**
 * MANDATE Shared Types
 * Based on game documentation
 */

// =============================================================================
// Player / Seat
// =============================================================================

export type Seat = 'LEFT' | 'RIGHT' | 'INDEP';

export type ConnectionState = 'CONNECTED' | 'DISCONNECTED_GRACE';

export type LoadingState = 'NOT_LOADED' | 'LOADING' | 'LOADED';

export interface Player {
    player_id: string;
    display_name: string;
    seat?: Seat;
    ready: boolean;
    loading_state: LoadingState;
    connection_state: ConnectionState;
}

// =============================================================================
// Room
// =============================================================================

export type RoomPhase =
    | 'ROOM_OPEN'
    | 'ROOM_READY_CHECK'
    | 'ROOM_LOADING'
    | 'ROOM_IN_MATCH'
    | 'ROOM_POST_MATCH';

export interface Room {
    room_id: string;
    invite_code: string;
    phase: RoomPhase;
    players: Player[];
    host_player_id: string;
}

// =============================================================================
// Cards
// =============================================================================

export type CardKind = 'ASSET' | 'CRISIS';

export type AssetColor =
    | 'INSTITUTION'
    | 'BASE'
    | 'MEDIA'
    | 'CAPITAL'
    | 'IDEOLOGY'
    | 'LOGISTICS';

export type AssetValue = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';

export interface AssetCard {
    card_def_id: string;
    kind: 'ASSET';
    asset_color: AssetColor;
    asset_value: AssetValue;
}

export interface CrisisCard {
    card_def_id: string;
    kind: 'CRISIS';
    crisis_state?: {
        declared_color: AssetColor;
        declared_value: AssetValue;
    };
}

export type Card = AssetCard | CrisisCard;

export interface CardInstance {
    card_instance_id: string;
    card: Card;
}

// =============================================================================
// Districts
// =============================================================================

export type DistrictId = 'D0' | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6';

export interface DistrictSlot {
    slot_index: 0 | 1 | 2;
    card_instance_id: string | null;
}

export interface DistrictSide {
    seat: Seat;
    slots: [DistrictSlot, DistrictSlot, DistrictSlot];
}

export interface District {
    district_id: DistrictId;
    sides: {
        LEFT: DistrictSide;
        RIGHT: DistrictSide;
        INDEP: DistrictSide;
    };
    claimed_by: Seat | null;
}

// =============================================================================
// Configuration Types (Winning Hands)
// =============================================================================

export type ConfigurationType =
    | 'TOTAL_MANDATE'  // AAA
    | 'COLOR_RUN'      // Same color + consecutive
    | 'UNIFIED_MESSAGE'// Same value
    | 'SAME_COLOR'     // Same color
    | 'RUN'            // Consecutive values
    | 'PARTY'          // Two same values
    | 'RAW_PRESSURE';  // Sum of values

export interface WinningConfiguration {
    type: ConfigurationType;
    rank: number;
}

// =============================================================================
// Match / Round State
// =============================================================================

export interface RoundState {
    round_id: string;
    round_index: 1 | 2 | 3;
    starting_seat: Seat;
    active_seat: Seat;
    draw_pile_count: number;
    hand_counts: Record<Seat, number>;
    districts: District[];
    claimed_counts: Record<Seat, number>;
}

export interface MatchState {
    match_id: string;
    seats: Record<Seat, string>; // seat → player_id
    match_score: Record<Seat, number>;
    current_round?: RoundState;
}
