/**
 * MANDATE Round Module
 * 7 districts, 3 sides × 3 slots, turn loop
 */

import { Deck, type CardInstance, type AssetColor, type AssetValue } from './Deck.js';
import { evaluateConfig, compareConfig, toEvalCard } from './RulesEngine.js';
import type { ClaimResult, ClaimCandidate } from '@mandate/shared';

// =============================================================================
// Types
// =============================================================================

export type Seat = 'LEFT' | 'RIGHT' | 'INDEP';

export type RoundPhase =
    | 'ROUND_SETUP'
    | 'ROUND_DEAL'
    | 'TURN_START'
    | 'TURN_AWAIT_ACTION'
    | 'TURN_AWAIT_CRISIS_DECLARATION'
    | 'TURN_RESOLVE_PLAY'
    | 'TURN_CLAIM_CHECK'
    | 'TURN_DRAW'
    | 'TURN_END'
    | 'ROUND_END';

export type DistrictStatus = 'OPEN' | 'CLAIMED';

export interface DistrictSide {
    slots: (CardInstance | null)[];
}

export interface District {
    district_id: string;
    district_index: number;
    status: DistrictStatus;
    claimed_by: Seat | null;
    sides: Record<Seat, DistrictSide>;
}

export interface PendingPlay {
    seat: Seat;
    card_instance_id: string;
    district_id: string;
    slot_index: number;
}

export interface PendingCrisis {
    seat: Seat;
    card_instance_id: string;
    district_id: string;
    slot_index: number;
}

// =============================================================================
// Round Class
// =============================================================================

export class Round {
    readonly round_id: string;
    readonly round_index: number;
    readonly starting_seat: Seat;
    readonly rng_seed: string;

    phase: RoundPhase;
    active_seat: Seat;
    turn_number: number;

    private deck: Deck;
    private hands: Map<Seat, CardInstance[]>;
    private districts: Map<string, District>;

    claimed_counts: Record<Seat, number>;
    pending_play: PendingPlay | null;
    pending_crisis: PendingCrisis | null;

    constructor(round_index: number, starting_seat: Seat, seed?: string) {
        this.round_id = `round_${round_index}_${Date.now().toString(36)}`;
        this.round_index = round_index;
        this.starting_seat = starting_seat;
        this.rng_seed = seed ?? `seed_${Date.now()}`;

        this.phase = 'ROUND_SETUP';
        this.active_seat = starting_seat;
        this.turn_number = 0;

        this.deck = new Deck(this.round_id, this.rng_seed);
        this.hands = new Map();
        this.districts = new Map();

        this.claimed_counts = { LEFT: 0, RIGHT: 0, INDEP: 0 };
        this.pending_play = null;
        this.pending_crisis = null;

        this.initDistricts();
        this.deal();
    }

    // ===========================================================================
    // Initialization
    // ===========================================================================

    private initDistricts(): void {
        for (let i = 0; i < 7; i++) {
            const district: District = {
                district_id: `D${i}`,
                district_index: i,
                status: 'OPEN',
                claimed_by: null,
                sides: {
                    LEFT: { slots: [null, null, null] },
                    RIGHT: { slots: [null, null, null] },
                    INDEP: { slots: [null, null, null] },
                },
            };
            this.districts.set(district.district_id, district);
        }
    }

    private deal(): void {
        this.phase = 'ROUND_DEAL';

        // Deal 6 cards to each player
        const seats: Seat[] = ['LEFT', 'RIGHT', 'INDEP'];
        for (const seat of seats) {
            this.hands.set(seat, this.deck.draw(6));
        }

        this.phase = 'TURN_START';
    }

    // ===========================================================================
    // Getters
    // ===========================================================================

    getHand(seat: Seat): CardInstance[] {
        return this.hands.get(seat) || [];
    }

    getHandCounts(): Record<Seat, number> {
        return {
            LEFT: this.getHand('LEFT').length,
            RIGHT: this.getHand('RIGHT').length,
            INDEP: this.getHand('INDEP').length,
        };
    }

    getDistrict(district_id: string): District | undefined {
        return this.districts.get(district_id);
    }

    getAllDistricts(): District[] {
        return Array.from(this.districts.values());
    }

    get draw_pile_count(): number {
        return this.deck.remaining;
    }

    // ===========================================================================
    // Turn Flow
    // ===========================================================================

    startTurn(): void {
        this.turn_number++;
        this.phase = 'TURN_AWAIT_ACTION';
    }

    advanceTurn(): void {
        // Rotate seats: LEFT → RIGHT → INDEP → LEFT
        const order: Seat[] = ['LEFT', 'RIGHT', 'INDEP'];
        const currentIndex = order.indexOf(this.active_seat);
        this.active_seat = order[(currentIndex + 1) % 3];
        this.phase = 'TURN_START';
    }

    // ===========================================================================
    // Card Placement
    // ===========================================================================

    validatePlayCard(
        seat: Seat,
        card_instance_id: string,
        district_id: string,
        slot_index: number
    ): { valid: boolean; error?: string } {
        // 1. Check if it's player's turn
        if (this.active_seat !== seat) {
            return { valid: false, error: 'NOT_YOUR_TURN' };
        }

        // 2. Check phase
        if (this.phase !== 'TURN_AWAIT_ACTION') {
            return { valid: false, error: 'INVALID_PHASE' };
        }

        // 3. Check card in hand
        const hand = this.getHand(seat);
        const cardIndex = hand.findIndex(c => c.card_instance_id === card_instance_id);
        if (cardIndex === -1) {
            return { valid: false, error: 'CARD_NOT_IN_HAND' };
        }

        // 4. Check district exists
        const district = this.getDistrict(district_id);
        if (!district) {
            return { valid: false, error: 'DISTRICT_NOT_FOUND' };
        }

        // 5. Check district is open
        if (district.status === 'CLAIMED') {
            return { valid: false, error: 'DISTRICT_CLAIMED' };
        }

        // 6. Check slot index valid
        if (slot_index < 0 || slot_index > 2) {
            return { valid: false, error: 'INVALID_SLOT_INDEX' };
        }

        // 7. Check slot is empty on player's side
        const side = district.sides[seat];
        if (side.slots[slot_index] !== null) {
            return { valid: false, error: 'SLOT_OCCUPIED' };
        }

        // 8. Check side isn't full
        const filledSlots = side.slots.filter(s => s !== null).length;
        if (filledSlots >= 3) {
            return { valid: false, error: 'SIDE_FULL' };
        }

        return { valid: true };
    }

    playCard(
        seat: Seat,
        card_instance_id: string,
        district_id: string,
        slot_index: number
    ): CardInstance | null {
        // Remove from hand
        const hand = this.getHand(seat);
        const cardIndex = hand.findIndex(c => c.card_instance_id === card_instance_id);
        if (cardIndex === -1) return null;

        const [card] = hand.splice(cardIndex, 1);

        // Check if crisis - needs declaration
        if (card.kind === 'CRISIS') {
            this.pending_crisis = {
                seat,
                card_instance_id,
                district_id,
                slot_index,
            };
            this.phase = 'TURN_AWAIT_CRISIS_DECLARATION';
            return card;
        }

        // Place on board
        const district = this.getDistrict(district_id)!;
        district.sides[seat].slots[slot_index] = card;

        this.phase = 'TURN_RESOLVE_PLAY';
        return card;
    }

    declareCrisis(
        seat: Seat,
        declared_color: AssetColor,
        declared_value: AssetValue
    ): boolean {
        if (!this.pending_crisis || this.pending_crisis.seat !== seat) {
            return false;
        }

        if (this.phase !== 'TURN_AWAIT_CRISIS_DECLARATION') {
            return false;
        }

        // Value must be 2-10 (not Ace)
        if (declared_value === 'A') {
            return false;
        }

        // Find the crisis card (was already removed from hand)
        const { district_id, slot_index, card_instance_id } = this.pending_crisis;

        // Create crisis card with declaration
        const crisisCard: CardInstance = {
            card_instance_id,
            card_def_id: card_instance_id.split(':')[1],
            kind: 'CRISIS',
            crisis_state: {
                declared_color,
                declared_value,
            },
        };

        // Place on board
        const district = this.getDistrict(district_id)!;
        district.sides[seat].slots[slot_index] = crisisCard;

        this.pending_crisis = null;
        this.phase = 'TURN_RESOLVE_PLAY';
        return true;
    }

    // ===========================================================================
    // Draw Phase
    // ===========================================================================

    drawCard(seat: Seat): CardInstance | null {
        if (this.deck.isEmpty) return null;

        const [card] = this.deck.draw(1);
        this.getHand(seat).push(card);
        return card;
    }

    // ===========================================================================
    // Claim Resolution (uses RulesEngine)
    // ===========================================================================

    /**
     * Check which districts should be claimed.
     * Claim triggers (per 02_digital_ruleset.md):
     * 1. Any player has AAA (Total Mandate) -> immediate claim
     * 2. >= 2 players have 3 cards at the district
     */
    checkForClaims(): string[] {
        const claimableDistricts: string[] = [];

        for (const district of this.getAllDistricts()) {
            if (district.status === 'CLAIMED') continue;

            // Count players with 3 cards and check for AAA
            let completedCount = 0;
            let hasAAA = false;

            for (const seat of ['LEFT', 'RIGHT', 'INDEP'] as Seat[]) {
                const cards = district.sides[seat].slots.filter(s => s !== null);
                if (cards.length === 3) {
                    completedCount++;

                    // Check for AAA
                    const evalCards = cards.map(c => toEvalCard(c!));
                    if (evalCards.every(c => c.value === 'A')) {
                        hasAAA = true;
                    }
                }
            }

            // Claim trigger: AAA or 2+ completed
            if (hasAAA || completedCount >= 2) {
                claimableDistricts.push(district.district_id);
            }
        }

        return claimableDistricts;
    }

    /**
     * Resolve all claimable districts in deterministic order.
     * Per 03_game_state_machine.md: resolve by district_index ascending.
     */
    resolveAllClaims(): ClaimResult[] {
        const claimable = this.checkForClaims();
        if (claimable.length === 0) return [];

        // Sort by district index for deterministic ordering
        claimable.sort((a, b) => {
            const dA = this.getDistrict(a)!;
            const dB = this.getDistrict(b)!;
            return dA.district_index - dB.district_index;
        });

        const results: ClaimResult[] = [];

        for (const districtId of claimable) {
            const district = this.getDistrict(districtId)!;
            if (district.status === 'CLAIMED') continue;

            // Build candidates (only players with 3 cards)
            const candidates: ClaimCandidate[] = [];

            for (const seat of ['LEFT', 'RIGHT', 'INDEP'] as Seat[]) {
                const cards = district.sides[seat].slots.filter(s => s !== null);
                if (cards.length === 3) {
                    const evalCards = cards.map(c => toEvalCard(c!));
                    const config = evaluateConfig(evalCards);
                    candidates.push({ seat, config });
                }
            }

            if (candidates.length === 0) continue;

            // Find winner (lowest rank wins, then tiebreakers)
            candidates.sort((a, b) => compareConfig(a.config, b.config));
            const winner = candidates[0];

            // Apply claim
            district.status = 'CLAIMED';
            district.claimed_by = winner.seat;
            this.claimed_counts[winner.seat]++;

            results.push({
                district_id: districtId,
                winner: winner.seat,
                winning_config: winner.config,
                candidates,
            });
        }

        return results;
    }

    claimDistrict(district_id: string, winner: Seat): void {
        const district = this.getDistrict(district_id);
        if (!district) return;

        district.status = 'CLAIMED';
        district.claimed_by = winner;
        this.claimed_counts[winner]++;
    }

    // ===========================================================================
    // Round End Check
    // ===========================================================================

    checkRoundEnd(): Seat | null {
        // First to 3 districts wins
        for (const seat of ['LEFT', 'RIGHT', 'INDEP'] as Seat[]) {
            if (this.claimed_counts[seat] >= 3) {
                this.phase = 'ROUND_END';
                return seat;
            }
        }
        return null;
    }

    // ===========================================================================
    // Serialization
    // ===========================================================================

    toPublicState(): object {
        return {
            round_id: this.round_id,
            round_index: this.round_index,
            phase: this.phase,
            active_seat: this.active_seat,
            turn_number: this.turn_number,
            draw_pile_count: this.draw_pile_count,
            hand_counts: this.getHandCounts(),
            districts: this.getAllDistricts().map(d => ({
                district_id: d.district_id,
                status: d.status,
                claimed_by: d.claimed_by,
                sides: {
                    LEFT: { cards: d.sides.LEFT.slots.map(c => c ? this.cardToPublic(c) : null) },
                    RIGHT: { cards: d.sides.RIGHT.slots.map(c => c ? this.cardToPublic(c) : null) },
                    INDEP: { cards: d.sides.INDEP.slots.map(c => c ? this.cardToPublic(c) : null) },
                },
            })),
            claimed_counts: this.claimed_counts,
        };
    }

    private cardToPublic(card: CardInstance): object {
        return {
            card_instance_id: card.card_instance_id,
            card_def_id: card.card_def_id,
            kind: card.kind,
            asset_color: card.asset_color,
            asset_value: card.asset_value,
            crisis_state: card.crisis_state,
        };
    }

    getPrivateHand(seat: Seat): object[] {
        return this.getHand(seat).map(c => this.cardToPublic(c));
    }
}
