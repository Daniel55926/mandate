/**
 * Auto-Action Module
 * Deterministic auto-play and auto-pass for AFK/disconnect handling
 * Per 12_disconnect_and_reconnect_rules.md
 */

import type { Round, Seat } from './match/Round.js';

// =============================================================================
// Types
// =============================================================================

export interface AutoPlayAction {
    type: 'PLAY';
    card_instance_id: string;
    card_def_id: string;
    district_id: string;
    slot_index: number;
}

export interface AutoPassAction {
    type: 'PASS';
}

export type AutoAction = AutoPlayAction | AutoPassAction;

// =============================================================================
// Auto-Play Selection (Deterministic)
// =============================================================================

/**
 * Select an auto-play action for a disconnected/AFK player.
 * Algorithm (per doc):
 * 1. Enumerate all legal placements
 * 2. Sort by district_index, slot_index, card_def_id
 * 3. Pick first (deterministic)
 * 4. Return null if no legal plays → caller should auto-pass
 */
export function selectAutoPlay(round: Round, seat: Seat): AutoAction {
    const hand = round.getHand(seat);
    const districts = round.getAllDistricts();

    // Enumerate all legal placements
    const legalPlays: AutoPlayAction[] = [];

    for (const card of hand) {
        for (const district of districts) {
            // Skip claimed districts
            if (district.status === 'CLAIMED') continue;

            const side = district.sides[seat];
            const filledSlots = side.slots.filter(s => s !== null).length;

            // Skip if already have 3 cards
            if (filledSlots >= 3) continue;

            // Find first empty slot
            for (let slotIndex = 0; slotIndex < 3; slotIndex++) {
                if (side.slots[slotIndex] === null) {
                    legalPlays.push({
                        type: 'PLAY',
                        card_instance_id: card.card_instance_id,
                        card_def_id: card.card_def_id,
                        district_id: district.district_id,
                        slot_index: slotIndex,
                    });
                    break; // Only one play per card per district
                }
            }
        }
    }

    // No legal plays → auto-pass
    if (legalPlays.length === 0) {
        return { type: 'PASS' };
    }

    // Sort deterministically: district_index, slot_index, card_def_id
    legalPlays.sort((a, b) => {
        const distA = parseInt(a.district_id.slice(1), 10);
        const distB = parseInt(b.district_id.slice(1), 10);
        if (distA !== distB) return distA - distB;

        if (a.slot_index !== b.slot_index) return a.slot_index - b.slot_index;

        return a.card_def_id.localeCompare(b.card_def_id);
    });

    // Pick first (most deterministic)
    return legalPlays[0];
}

// =============================================================================
// Auto-Crisis Declaration (Deterministic)
// =============================================================================

export interface AutoCrisisDeclaration {
    declared_color: string;
    declared_value: string;
}

/**
 * Select deterministic crisis declaration.
 * Per doc: first color (INSTITUTION), first value (2)
 */
export function selectAutoCrisis(): AutoCrisisDeclaration {
    return {
        declared_color: 'INSTITUTION',
        declared_value: '2',
    };
}
