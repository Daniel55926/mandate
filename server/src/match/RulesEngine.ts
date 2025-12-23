/**
 * MANDATE Rules Engine
 * Pure functions for configuration evaluation and comparison
 * Per 02_digital_ruleset.md and 04_data_model_cards_and_districts.md
 */

import type {
    AssetValue,
    EvalCard,
    Configuration,
} from '@mandate/shared';

import { CONFIG_RANKS } from '@mandate/shared';

// =============================================================================
// Value Conversion
// =============================================================================

/**
 * Convert card value to numeric value for calculations.
 * Ace = 11 for totals and comparisons.
 */
export function cardValue(value: AssetValue): number {
    if (value === 'A') return 11;
    return parseInt(value, 10);
}

/**
 * Convert card value to numeric for run detection.
 * For A-2-3 run: A=1
 * Otherwise: A=11
 */
function cardValueForRun(value: AssetValue, checkLowAce: boolean): number {
    if (value === 'A') return checkLowAce ? 1 : 11;
    return parseInt(value, 10);
}

// =============================================================================
// Run Detection
// =============================================================================

/**
 * Check if three values form a consecutive run.
 * Valid runs include:
 * - A-2-3 (Ace as 1)
 * - 9-10-A (Ace as 11)
 * - Any other 3 consecutive numbers
 * Ace CANNOT be in the middle of a run.
 */
export function isRun(values: AssetValue[]): boolean {
    if (values.length !== 3) return false;

    // Try with Ace as 1 (for A-2-3)
    const lowNums = values.map(v => cardValueForRun(v, true)).sort((a, b) => a - b);
    if (lowNums[1] === lowNums[0] + 1 && lowNums[2] === lowNums[1] + 1) {
        // Check Ace is not in the middle
        if (values.includes('A')) {
            const acePos = lowNums.indexOf(1);
            if (acePos === 1) return false; // Ace in middle
        }
        return true;
    }

    // Try with Ace as 11 (for 9-10-A)
    const highNums = values.map(v => cardValueForRun(v, false)).sort((a, b) => a - b);
    if (highNums[1] === highNums[0] + 1 && highNums[2] === highNums[1] + 1) {
        // Check Ace is not in the middle
        if (values.includes('A')) {
            const acePos = highNums.indexOf(11);
            if (acePos === 1) return false; // Ace in middle
        }
        return true;
    }

    return false;
}

// =============================================================================
// Configuration Evaluation
// =============================================================================

/**
 * Evaluate 3 cards to determine configuration type and strength.
 * Pure function: same inputs always produce same output.
 */
export function evaluateConfig(cards: EvalCard[]): Configuration {
    if (cards.length !== 3) {
        throw new Error('Configuration requires exactly 3 cards');
    }

    const values = cards.map(c => c.value);
    const colors = cards.map(c => c.color);
    const numericValues = values.map(cardValue);
    const total = numericValues.reduce((a, b) => a + b, 0);

    const allSameColor = colors[0] === colors[1] && colors[1] === colors[2];
    const isConsecutive = isRun(values);
    const allAces = values.every(v => v === 'A');
    const nonAceValues = values.filter(v => v !== 'A');
    const allSameValue = nonAceValues.length === 3 &&
        nonAceValues[0] === nonAceValues[1] && nonAceValues[1] === nonAceValues[2];

    // 1. TOTAL_MANDATE: Three Aces
    if (allAces) {
        return {
            type: 'TOTAL_MANDATE',
            rank: CONFIG_RANKS.TOTAL_MANDATE,
            total_value: total,
            tiebreak: { primary: total },
        };
    }

    // 2. COLOR_RUN: Same color + consecutive
    if (allSameColor && isConsecutive) {
        return {
            type: 'COLOR_RUN',
            rank: CONFIG_RANKS.COLOR_RUN,
            total_value: total,
            tiebreak: { primary: total },
        };
    }

    // 3. UNIFIED_MESSAGE: Three of a kind (not aces)
    if (allSameValue) {
        return {
            type: 'UNIFIED_MESSAGE',
            rank: CONFIG_RANKS.UNIFIED_MESSAGE,
            total_value: total,
            tiebreak: { primary: total },
        };
    }

    // 4. SAME_COLOR: Same color, not consecutive
    if (allSameColor) {
        return {
            type: 'SAME_COLOR',
            rank: CONFIG_RANKS.SAME_COLOR,
            total_value: total,
            tiebreak: { primary: total },
        };
    }

    // 5. RUN: Consecutive, mixed colors
    if (isConsecutive) {
        return {
            type: 'RUN',
            rank: CONFIG_RANKS.RUN,
            total_value: total,
            tiebreak: { primary: total },
        };
    }

    // 6. PARTY: Pair (+ kicker) or double Ace
    const valueCounts = new Map<AssetValue, number>();
    for (const v of values) {
        valueCounts.set(v, (valueCounts.get(v) || 0) + 1);
    }

    let pairValue: number | null = null;
    let kickerValue: number | null = null;

    for (const [val, count] of valueCounts) {
        if (count >= 2) {
            pairValue = cardValue(val);
            // Find kicker
            for (const [kVal, kCount] of valueCounts) {
                if (kVal !== val || kCount > 2) {
                    if (kVal !== val) {
                        kickerValue = cardValue(kVal);
                        break;
                    }
                }
            }
            break;
        }
    }

    if (pairValue !== null) {
        return {
            type: 'PARTY',
            rank: CONFIG_RANKS.PARTY,
            total_value: total,
            tiebreak: {
                primary: total,
                pair_value: pairValue,
                kicker_value: kickerValue ?? 0,
            },
        };
    }

    // 7. RAW_PRESSURE: None of the above
    return {
        type: 'RAW_PRESSURE',
        rank: CONFIG_RANKS.RAW_PRESSURE,
        total_value: total,
        tiebreak: { primary: total },
    };
}

// =============================================================================
// Configuration Comparison
// =============================================================================

/**
 * Compare two configurations.
 * Returns:
 *   -1 if a wins (stronger)
 *    0 if tie
 *    1 if b wins (stronger)
 *
 * Comparison rules:
 * 1. Lower rank wins (TOTAL_MANDATE=1 beats COLOR_RUN=2)
 * 2. If same rank:
 *    - PARTY: compare pair_value, then kicker_value
 *    - Others: compare total_value
 */
export function compareConfig(a: Configuration, b: Configuration): -1 | 0 | 1 {
    // Compare ranks first
    if (a.rank < b.rank) return -1;
    if (a.rank > b.rank) return 1;

    // Same rank - apply tiebreakers
    if (a.type === 'PARTY' && b.type === 'PARTY') {
        // Compare pair values first
        const pairA = a.tiebreak.pair_value ?? 0;
        const pairB = b.tiebreak.pair_value ?? 0;
        if (pairA > pairB) return -1;
        if (pairA < pairB) return 1;

        // Compare kicker values
        const kickerA = a.tiebreak.kicker_value ?? 0;
        const kickerB = b.tiebreak.kicker_value ?? 0;
        if (kickerA > kickerB) return -1;
        if (kickerA < kickerB) return 1;

        return 0;
    }

    // For all other types, compare total value
    if (a.total_value > b.total_value) return -1;
    if (a.total_value < b.total_value) return 1;

    return 0;
}

// =============================================================================
// Utility: Convert CardInstance to EvalCard
// =============================================================================

export interface CardInstanceLike {
    asset_color?: string;
    asset_value?: string;
    kind: 'ASSET' | 'CRISIS';
    crisis_state?: {
        declared_color: string;
        declared_value: string;
    };
}

/**
 * Convert a card instance (from Round) to an EvalCard for evaluation.
 */
export function toEvalCard(card: CardInstanceLike): EvalCard {
    if (card.kind === 'CRISIS' && card.crisis_state) {
        return {
            color: card.crisis_state.declared_color as EvalCard['color'],
            value: card.crisis_state.declared_value as EvalCard['value'],
            is_crisis: true,
        };
    }

    return {
        color: card.asset_color as EvalCard['color'],
        value: card.asset_value as EvalCard['value'],
        is_crisis: false,
    };
}
