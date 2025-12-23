/**
 * MANDATE Match Module
 * BO3 match wrapper around rounds
 */

import { Round, type Seat } from './Round.js';

// =============================================================================
// Types
// =============================================================================

export type MatchPhase =
    | 'MATCH_INIT'
    | 'MATCH_ROUND_INIT'
    | 'MATCH_ROUND_ACTIVE'
    | 'MATCH_ROUND_END'
    | 'MATCH_END';

export interface MatchResult {
    winner: Seat;
    match_score: Record<Seat, number>;
    tiebreak: string | null;
}

// =============================================================================
// Match Class
// =============================================================================

export class Match {
    readonly match_id: string;
    readonly seats: Record<Seat, string>; // seat -> playerId

    phase: MatchPhase;
    match_score: Record<Seat, number>;
    round_index: number;
    districts_won_total: Record<Seat, number>;

    current_round: Round | null;

    constructor(seatAssignments: Record<Seat, string>) {
        this.match_id = `match_${Date.now().toString(36)}`;
        this.seats = seatAssignments;

        this.phase = 'MATCH_INIT';
        this.match_score = { LEFT: 0, RIGHT: 0, INDEP: 0 };
        this.round_index = 0;
        this.districts_won_total = { LEFT: 0, RIGHT: 0, INDEP: 0 };
        this.current_round = null;
    }

    // ===========================================================================
    // Round Management
    // ===========================================================================

    startNextRound(): Round {
        this.round_index++;
        this.phase = 'MATCH_ROUND_ACTIVE';

        // Starting player rotates: round 1 = LEFT, round 2 = RIGHT, round 3 = INDEP
        const startingSeats: Seat[] = ['LEFT', 'RIGHT', 'INDEP'];
        const starting_seat = startingSeats[(this.round_index - 1) % 3];

        this.current_round = new Round(this.round_index, starting_seat);
        return this.current_round;
    }

    endRound(winner: Seat): void {
        if (!this.current_round) return;

        this.phase = 'MATCH_ROUND_END';
        this.match_score[winner]++;

        // Add district counts
        for (const seat of ['LEFT', 'RIGHT', 'INDEP'] as Seat[]) {
            this.districts_won_total[seat] += this.current_round.claimed_counts[seat];
        }
    }

    // ===========================================================================
    // Match End Check
    // ===========================================================================

    checkMatchEnd(): MatchResult | null {
        // First to 2 round wins
        for (const seat of ['LEFT', 'RIGHT', 'INDEP'] as Seat[]) {
            if (this.match_score[seat] >= 2) {
                this.phase = 'MATCH_END';
                return {
                    winner: seat,
                    match_score: { ...this.match_score },
                    tiebreak: null,
                };
            }
        }

        // After round 3, apply tiebreak
        if (this.round_index >= 3) {
            const winner = this.resolveTiebreak();
            this.phase = 'MATCH_END';
            return {
                winner,
                match_score: { ...this.match_score },
                tiebreak: 'districts_won_total',
            };
        }

        return null;
    }

    private resolveTiebreak(): Seat {
        // Tiebreak: highest districts_won_total
        const seats: Seat[] = ['LEFT', 'RIGHT', 'INDEP'];
        seats.sort((a, b) => this.districts_won_total[b] - this.districts_won_total[a]);
        return seats[0];
    }

    // ===========================================================================
    // Player ID Helpers
    // ===========================================================================

    getSeatForPlayer(playerId: string): Seat | null {
        for (const [seat, id] of Object.entries(this.seats)) {
            if (id === playerId) return seat as Seat;
        }
        return null;
    }

    getPlayerIdForSeat(seat: Seat): string {
        return this.seats[seat];
    }

    // ===========================================================================
    // Serialization
    // ===========================================================================

    toState(): object {
        return {
            match_id: this.match_id,
            phase: this.phase,
            match_score: this.match_score,
            round_index: this.round_index,
            seats: this.seats,
            districts_won_total: this.districts_won_total,
        };
    }
}
