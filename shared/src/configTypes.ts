/**
 * Configuration Types for MANDATE
 * Per 04_data_model_cards_and_districts.md
 */

import type { AssetColor, AssetValue } from './types.js';

// Re-export for convenience
export type { AssetColor, AssetValue } from './types.js';

// =============================================================================
// Configuration Types (ordered strongest → weakest)
// =============================================================================

export type ConfigType =
    | 'TOTAL_MANDATE'     // rank 1: AAA (three aces)
    | 'COLOR_RUN'         // rank 2: same color + consecutive
    | 'UNIFIED_MESSAGE'   // rank 3: three of a kind (not aces)
    | 'SAME_COLOR'        // rank 4: same color, not consecutive
    | 'RUN'               // rank 5: consecutive, mixed colors
    | 'PARTY'             // rank 6: pair + kicker
    | 'RAW_PRESSURE';     // rank 7: sum of values

export const CONFIG_RANKS: Record<ConfigType, number> = {
    TOTAL_MANDATE: 1,
    COLOR_RUN: 2,
    UNIFIED_MESSAGE: 3,
    SAME_COLOR: 4,
    RUN: 5,
    PARTY: 6,
    RAW_PRESSURE: 7,
};

// =============================================================================
// Card for Evaluation
// =============================================================================

/**
 * A card prepared for configuration evaluation.
 * Crisis cards should have their declared color/value set.
 */
export interface EvalCard {
    color: AssetColor;
    value: AssetValue;
    is_crisis: boolean;
}

// =============================================================================
// Configuration Result
// =============================================================================

export interface Configuration {
    type: ConfigType;
    rank: number;           // 1-7 (lower = stronger)
    total_value: number;    // sum of card values (Ace = 11)
    tiebreak: {
        primary: number;      // total_value for most types
        pair_value?: number;  // for PARTY: the pair's value
        kicker_value?: number;// for PARTY: the third card's value
    };
}

// =============================================================================
// Claim Resolution
// =============================================================================

export interface ClaimCandidate {
    seat: 'LEFT' | 'RIGHT' | 'INDEP';
    config: Configuration;
}

export interface ClaimResult {
    district_id: string;
    winner: 'LEFT' | 'RIGHT' | 'INDEP';
    winning_config: Configuration;
    candidates: ClaimCandidate[];
}
