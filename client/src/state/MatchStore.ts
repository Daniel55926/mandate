/**
 * MatchStore - Client-side match/round state management
 */

import type { EventMessage } from '@mandate/shared';

// =============================================================================
// Types
// =============================================================================

export type Seat = 'LEFT' | 'RIGHT' | 'INDEP';

export interface CardInfo {
    card_instance_id: string;
    card_def_id: string;
    kind: 'ASSET' | 'CRISIS';
    asset_color?: string;
    asset_value?: string;
    crisis_state?: {
        declared_color: string;
        declared_value: string;
    };
}

export interface DistrictSide {
    cards: (CardInfo | null)[];
}

export interface DistrictInfo {
    district_id: string;
    status: 'OPEN' | 'CLAIMED';
    claimed_by: Seat | null;
    sides: Record<Seat, DistrictSide>;
}

export interface RoundInfo {
    round_id: string;
    round_index: number;
    active_seat: Seat;
    turn_number: number;
    draw_pile_count: number;
    hand_counts: Record<Seat, number>;
    districts: DistrictInfo[];
    claimed_counts: Record<Seat, number>;
}

export interface MatchInfo {
    match_id: string;
    seats: Record<Seat, string>; // seat -> playerId
    match_score: Record<Seat, number>;
}

export type MatchStateCallback = (state: MatchState) => void;

// =============================================================================
// Match State
// =============================================================================

export interface PendingCrisis {
    cardInstanceId: string;
    deadlineMs: number;
}

export interface MatchState {
    inMatch: boolean;
    playerId: string | null;
    mySeat: Seat | null;
    match: MatchInfo | null;
    round: RoundInfo | null;
    hand: CardInfo[];
    isMyTurn: boolean;
    pendingCrisis: PendingCrisis | null;
}

// =============================================================================
// MatchStore
// =============================================================================

export class MatchStore {
    private state: MatchState = {
        inMatch: false,
        playerId: null,
        mySeat: null,
        match: null,
        round: null,
        hand: [],
        isMyTurn: false,
        pendingCrisis: null,
    };

    private listeners: MatchStateCallback[] = [];

    // History event callback for game log
    public onHistoryEvent: ((type: string, data: unknown) => void) | null = null;

    // ===========================================================================
    // Public API
    // ===========================================================================

    getState(): MatchState {
        return { ...this.state };
    }

    setPlayerId(playerId: string | null): void {
        this.state.playerId = playerId;
    }

    /**
     * Reorder a card in hand to a new position (for local hand sorting)
     */
    reorderHand(cardId: string, newIndex: number): void {
        const hand = this.state.hand;
        const currentIndex = hand.findIndex(c => c.card_instance_id === cardId);
        if (currentIndex === -1 || currentIndex === newIndex) return;

        // Remove from current position
        const [card] = hand.splice(currentIndex, 1);

        // Insert at new position (clamped to valid range)
        const targetIndex = Math.max(0, Math.min(newIndex, hand.length));
        hand.splice(targetIndex, 0, card);

        this.notify();
    }

    handleEvent(event: EventMessage): void {
        switch (event.type) {
            case 'MATCH_STARTED':
                this.handleMatchStarted(event.payload as any);
                break;
            case 'ROUND_STARTED':
                this.handleRoundStarted(event.payload as any);
                break;
            case 'HAND_SNAPSHOT':
                this.handleHandSnapshot(event.payload as any);
                break;
            case 'TURN_STARTED':
                this.handleTurnStarted(event.payload as any);
                break;
            case 'TURN_ENDED':
                this.handleTurnEnded(event.payload as any);
                break;
            case 'CARD_PLAYED':
                this.handleCardPlayed(event.payload as any);
                break;
            case 'CARD_DRAWN':
                this.handleCardDrawn(event.payload as any);
                break;
            case 'DISTRICT_CLAIMED':
                this.handleDistrictClaimed(event.payload as any);
                break;
            case 'ROUND_ENDED':
                this.handleRoundEnded(event.payload as any);
                break;
            case 'CRISIS_DECLARATION_REQUIRED':
                this.handleCrisisRequired(event.payload as any);
                break;
            case 'CRISIS_DECLARED':
                this.handleCrisisDeclared(event.payload as any);
                break;
        }
    }

    subscribe(callback: MatchStateCallback): () => void {
        this.listeners.push(callback);
        callback(this.getState());
        return () => {
            const idx = this.listeners.indexOf(callback);
            if (idx >= 0) this.listeners.splice(idx, 1);
        };
    }

    // ===========================================================================
    // Event Handlers
    // ===========================================================================

    private handleMatchStarted(payload: {
        match_id: string;
        seats: Record<string, string>;
    }): void {
        this.state.inMatch = true;
        this.state.match = {
            match_id: payload.match_id,
            seats: payload.seats as Record<Seat, string>,
            match_score: { LEFT: 0, RIGHT: 0, INDEP: 0 },
        };

        // Determine my seat
        for (const [seat, playerId] of Object.entries(payload.seats)) {
            if (playerId === this.state.playerId) {
                this.state.mySeat = seat as Seat;
                break;
            }
        }

        this.notify();
    }

    private handleRoundStarted(payload: {
        round_id: string;
        round_index: number;
        starting_seat: Seat;
        active_seat: Seat;
        draw_pile_count: number;
        hand_counts: Record<Seat, number>;
    }): void {
        this.state.round = {
            round_id: payload.round_id,
            round_index: payload.round_index,
            active_seat: payload.active_seat,
            turn_number: 0,
            draw_pile_count: payload.draw_pile_count,
            hand_counts: payload.hand_counts,
            districts: this.initDistricts(),
            claimed_counts: { LEFT: 0, RIGHT: 0, INDEP: 0 },
        };
        this.notify();
    }

    private initDistricts(): DistrictInfo[] {
        const districts: DistrictInfo[] = [];
        for (let i = 0; i < 7; i++) {
            districts.push({
                district_id: `D${i}`,
                status: 'OPEN',
                claimed_by: null,
                sides: {
                    LEFT: { cards: [null, null, null] },
                    RIGHT: { cards: [null, null, null] },
                    INDEP: { cards: [null, null, null] },
                },
            });
        }
        return districts;
    }

    private handleHandSnapshot(payload: { hand: CardInfo[] }): void {
        this.state.hand = payload.hand;
        this.notify();
    }

    private handleTurnStarted(payload: {
        active_seat: Seat;
        turn_number: number;
    }): void {
        if (this.state.round) {
            this.state.round.active_seat = payload.active_seat;
            this.state.round.turn_number = payload.turn_number;
        }
        this.state.isMyTurn = payload.active_seat === this.state.mySeat;
        this.notify();
    }

    private handleTurnEnded(_payload: { seat: Seat }): void {
        this.state.isMyTurn = false;
        this.notify();
    }

    private handleCardPlayed(payload: {
        seat: Seat;
        district_id: string;
        slot_index: number;
        card: CardInfo | null;
        hand_counts: Record<Seat, number>;
    }): void {
        if (!this.state.round) return;

        // Update district
        const district = this.state.round.districts.find(
            d => d.district_id === payload.district_id
        );
        if (district && payload.card) {
            district.sides[payload.seat].cards[payload.slot_index] = payload.card;
        }

        // Emit history event
        if (this.onHistoryEvent && payload.card) {
            const districtIndex = this.state.round.districts.findIndex(
                d => d.district_id === payload.district_id
            );
            this.onHistoryEvent('CARD_PLAYED', {
                turn: this.state.round.turn_number,
                seat: payload.seat,
                card: payload.card,
                districtIndex,
            });
        }

        // Update hand counts
        this.state.round.hand_counts = payload.hand_counts;

        // Remove card from own hand if it was ours
        if (payload.seat === this.state.mySeat && payload.card) {
            this.state.hand = this.state.hand.filter(
                c => c.card_instance_id !== payload.card!.card_instance_id
            );
        }

        this.notify();
    }

    private handleCardDrawn(payload: {
        seat: Seat;
        draw_pile_count: number;
        hand_counts: Record<Seat, number>;
    }): void {
        if (!this.state.round) return;

        this.state.round.draw_pile_count = payload.draw_pile_count;
        this.state.round.hand_counts = payload.hand_counts;
        this.notify();
    }

    private handleDistrictClaimed(payload: {
        district_id: string;
        winner: Seat;
        claimed_counts: Record<Seat, number>;
    }): void {
        if (!this.state.round) return;

        const districtIndex = this.state.round.districts.findIndex(
            d => d.district_id === payload.district_id
        );
        const district = this.state.round.districts[districtIndex];
        if (district) {
            district.status = 'CLAIMED';
            district.claimed_by = payload.winner;
        }

        // Emit history event
        if (this.onHistoryEvent) {
            this.onHistoryEvent('DISTRICT_CLAIMED', {
                turn: this.state.round.turn_number,
                winner: payload.winner,
                districtIndex,
            });
        }

        this.state.round.claimed_counts = payload.claimed_counts;
        this.notify();
    }

    private handleRoundEnded(payload: {
        winner: Seat;
        claimed_counts: Record<Seat, number>;
    }): void {
        if (this.state.match) {
            this.state.match.match_score[payload.winner]++;
        }
        this.notify();
    }

    private handleCrisisRequired(payload: {
        seat: Seat;
        card_instance_id: string;
        deadline_ms: number;
    }): void {
        // Only show modal if it's my crisis
        if (payload.seat === this.state.mySeat) {
            this.state.pendingCrisis = {
                cardInstanceId: payload.card_instance_id,
                deadlineMs: payload.deadline_ms,
            };
        }
        this.notify();
    }

    private handleCrisisDeclared(_payload: {
        seat: Seat;
        card_instance_id: string;
        declared_color: string;
        declared_value: string;
    }): void {
        // Clear pending crisis
        this.state.pendingCrisis = null;
        this.notify();
    }

    // ===========================================================================
    // Private
    // ===========================================================================

    private notify(): void {
        const stateCopy = this.getState();
        for (const cb of this.listeners) {
            cb(stateCopy);
        }
    }
}

// Singleton instance
export const matchStore = new MatchStore();
