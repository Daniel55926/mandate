/**
 * MANDATE Deck Module
 * 63 cards: 60 assets (6 colors × 10 values) + 3 crisis
 */

// =============================================================================
// Types
// =============================================================================

export type AssetColor =
    | 'INSTITUTION'
    | 'BASE'
    | 'MEDIA'
    | 'CAPITAL'
    | 'IDEOLOGY'
    | 'LOGISTICS';

export type AssetValue = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';

export type CardKind = 'ASSET' | 'CRISIS';

export interface CardDefinition {
    card_def_id: string;
    kind: CardKind;
    asset_color?: AssetColor;
    asset_value?: AssetValue;
}

export interface CardInstance {
    card_instance_id: string;
    card_def_id: string;
    kind: CardKind;
    asset_color?: AssetColor;
    asset_value?: AssetValue;
    // Crisis declaration (set when played)
    crisis_state?: {
        declared_color: AssetColor;
        declared_value: AssetValue;
    };
}

// =============================================================================
// Constants
// =============================================================================

export const ASSET_COLORS: AssetColor[] = [
    'INSTITUTION',
    'BASE',
    'MEDIA',
    'CAPITAL',
    'IDEOLOGY',
    'LOGISTICS',
];

export const ASSET_VALUES: AssetValue[] = [
    'A', '2', '3', '4', '5', '6', '7', '8', '9', '10',
];

// =============================================================================
// Card Catalog Generation
// =============================================================================

export function generateCardCatalog(): CardDefinition[] {
    const cards: CardDefinition[] = [];

    // 60 Asset cards: 6 colors × 10 values
    for (const color of ASSET_COLORS) {
        for (const value of ASSET_VALUES) {
            cards.push({
                card_def_id: `asset.${color.toLowerCase()}.${value}`,
                kind: 'ASSET',
                asset_color: color,
                asset_value: value,
            });
        }
    }

    // 3 Crisis cards
    for (let i = 1; i <= 3; i++) {
        cards.push({
            card_def_id: `crisis.${i}`,
            kind: 'CRISIS',
        });
    }

    return cards; // 63 total
}

// =============================================================================
// Seeded Random Number Generator
// =============================================================================

export class SeededRNG {
    private seed: number;

    constructor(seed: number | string) {
        if (typeof seed === 'string') {
            // Hash string to number
            let hash = 0;
            for (let i = 0; i < seed.length; i++) {
                hash = (hash << 5) - hash + seed.charCodeAt(i);
                hash = hash & hash;
            }
            this.seed = Math.abs(hash) || 1;
        } else {
            this.seed = seed || 1;
        }
    }

    next(): number {
        // Simple LCG (Linear Congruential Generator)
        this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
        return this.seed / 4294967296;
    }

    nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
}

// =============================================================================
// Deck Class
// =============================================================================

export class Deck {
    private cards: CardInstance[];
    private roundId: string;
    private rng: SeededRNG;

    constructor(roundId: string, seed?: number | string) {
        this.roundId = roundId;
        this.rng = new SeededRNG(seed ?? Date.now());
        this.cards = this.buildDeck();
        this.shuffle();
    }

    private buildDeck(): CardInstance[] {
        const catalog = generateCardCatalog();
        return catalog.map(def => ({
            card_instance_id: `${this.roundId}:${def.card_def_id}`,
            card_def_id: def.card_def_id,
            kind: def.kind,
            asset_color: def.asset_color,
            asset_value: def.asset_value,
        }));
    }

    private shuffle(): void {
        // Fisher-Yates shuffle
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = this.rng.nextInt(0, i);
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    draw(count: number = 1): CardInstance[] {
        const drawn: CardInstance[] = [];
        for (let i = 0; i < count && this.cards.length > 0; i++) {
            drawn.push(this.cards.pop()!);
        }
        return drawn;
    }

    get remaining(): number {
        return this.cards.length;
    }

    get isEmpty(): boolean {
        return this.cards.length === 0;
    }
}

// =============================================================================
// Card Value Utilities
// =============================================================================

export function getNumericValue(value: AssetValue, forRun: 'low' | 'high' = 'high'): number {
    if (value === 'A') {
        return forRun === 'low' ? 1 : 11;
    }
    return parseInt(value, 10);
}

export function getEffectiveCard(card: CardInstance): { color: AssetColor; value: AssetValue } {
    if (card.kind === 'CRISIS' && card.crisis_state) {
        return {
            color: card.crisis_state.declared_color,
            value: card.crisis_state.declared_value,
        };
    }
    return {
        color: card.asset_color!,
        value: card.asset_value!,
    };
}
