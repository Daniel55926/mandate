/**
 * RulesEngine Unit Tests
 * Tests configuration evaluation and comparison per game rules
 */

import { describe, it, expect } from 'vitest';
import {
    evaluateConfig,
    compareConfig,
    cardValue,
    isRun,
} from './RulesEngine.js';
import type { EvalCard } from '@mandate/shared';

// Helper to create EvalCard
function card(color: EvalCard['color'], value: EvalCard['value'], crisis = false): EvalCard {
    return { color, value, is_crisis: crisis };
}

describe('cardValue', () => {
    it('returns numeric values for 2-10', () => {
        expect(cardValue('2')).toBe(2);
        expect(cardValue('5')).toBe(5);
        expect(cardValue('10')).toBe(10);
    });

    it('returns 11 for Ace', () => {
        expect(cardValue('A')).toBe(11);
    });
});

describe('isRun', () => {
    it('detects consecutive values', () => {
        expect(isRun(['3', '4', '5'])).toBe(true);
        expect(isRun(['7', '8', '9'])).toBe(true);
    });

    it('detects A-2-3 run (Ace low)', () => {
        expect(isRun(['A', '2', '3'])).toBe(true);
        expect(isRun(['2', 'A', '3'])).toBe(true); // order doesn't matter
    });

    it('detects 9-10-A run (Ace high)', () => {
        expect(isRun(['9', '10', 'A'])).toBe(true);
        expect(isRun(['A', '9', '10'])).toBe(true);
    });

    it('rejects non-consecutive values', () => {
        expect(isRun(['2', '4', '6'])).toBe(false);
        expect(isRun(['3', '5', '7'])).toBe(false);
    });

    it('rejects Ace in middle of run', () => {
        // A cannot be in middle (e.g., Q-A-2 is invalid)
        // Since we only have 2-10 + A, this is mainly for edge cases
        expect(isRun(['10', 'A', '2'])).toBe(false); // 10-11-2 gaps
    });
});

describe('evaluateConfig', () => {
    describe('TOTAL_MANDATE (AAA)', () => {
        it('detects three Aces', () => {
            const cards = [
                card('INSTITUTION', 'A'),
                card('MEDIA', 'A'),
                card('BASE', 'A'),
            ];
            const config = evaluateConfig(cards);
            expect(config.type).toBe('TOTAL_MANDATE');
            expect(config.rank).toBe(1);
            expect(config.total_value).toBe(33); // 11 + 11 + 11
        });
    });

    describe('COLOR_RUN', () => {
        it('detects same color consecutive values', () => {
            const cards = [
                card('INSTITUTION', '7'),
                card('INSTITUTION', '8'),
                card('INSTITUTION', '9'),
            ];
            const config = evaluateConfig(cards);
            expect(config.type).toBe('COLOR_RUN');
            expect(config.rank).toBe(2);
            expect(config.total_value).toBe(24);
        });

        it('detects A-2-3 color run', () => {
            const cards = [
                card('MEDIA', 'A'),
                card('MEDIA', '2'),
                card('MEDIA', '3'),
            ];
            const config = evaluateConfig(cards);
            expect(config.type).toBe('COLOR_RUN');
        });

        it('detects 9-10-A color run', () => {
            const cards = [
                card('BASE', '9'),
                card('BASE', '10'),
                card('BASE', 'A'),
            ];
            const config = evaluateConfig(cards);
            expect(config.type).toBe('COLOR_RUN');
        });
    });

    describe('UNIFIED_MESSAGE (three of a kind)', () => {
        it('detects three same values (not Aces)', () => {
            const cards = [
                card('INSTITUTION', '7'),
                card('MEDIA', '7'),
                card('BASE', '7'),
            ];
            const config = evaluateConfig(cards);
            expect(config.type).toBe('UNIFIED_MESSAGE');
            expect(config.rank).toBe(3);
            expect(config.total_value).toBe(21);
        });
    });

    describe('SAME_COLOR (flush, not consecutive)', () => {
        it('detects same color non-consecutive', () => {
            const cards = [
                card('CAPITAL', '2'),
                card('CAPITAL', '5'),
                card('CAPITAL', '9'),
            ];
            const config = evaluateConfig(cards);
            expect(config.type).toBe('SAME_COLOR');
            expect(config.rank).toBe(4);
        });
    });

    describe('RUN (straight, mixed colors)', () => {
        it('detects consecutive mixed colors', () => {
            const cards = [
                card('INSTITUTION', '7'),
                card('MEDIA', '8'),
                card('BASE', '9'),
            ];
            const config = evaluateConfig(cards);
            expect(config.type).toBe('RUN');
            expect(config.rank).toBe(5);
        });
    });

    describe('PARTY (pair)', () => {
        it('detects a pair', () => {
            const cards = [
                card('INSTITUTION', '8'),
                card('MEDIA', '8'),
                card('BASE', '3'),
            ];
            const config = evaluateConfig(cards);
            expect(config.type).toBe('PARTY');
            expect(config.rank).toBe(6);
            expect(config.tiebreak.pair_value).toBe(8);
            expect(config.tiebreak.kicker_value).toBe(3);
        });

        it('detects double Ace as party', () => {
            const cards = [
                card('INSTITUTION', 'A'),
                card('MEDIA', 'A'),
                card('BASE', '5'),
            ];
            const config = evaluateConfig(cards);
            expect(config.type).toBe('PARTY');
            expect(config.tiebreak.pair_value).toBe(11);
        });
    });

    describe('RAW_PRESSURE (high card)', () => {
        it('falls back to sum when no other pattern', () => {
            const cards = [
                card('INSTITUTION', '2'),
                card('MEDIA', '4'),
                card('BASE', '6'),
            ];
            const config = evaluateConfig(cards);
            expect(config.type).toBe('RAW_PRESSURE');
            expect(config.rank).toBe(7);
            expect(config.total_value).toBe(12);
        });
    });

    describe('Crisis cards', () => {
        it('treats crisis as declared value', () => {
            const cards = [
                card('MEDIA', '7'),
                card('MEDIA', '8'),
                card('MEDIA', '9', true), // Crisis declared as MEDIA 9
            ];
            const config = evaluateConfig(cards);
            expect(config.type).toBe('COLOR_RUN');
        });
    });
});

describe('compareConfig', () => {
    it('lower rank wins', () => {
        const totalMandate = evaluateConfig([
            card('INSTITUTION', 'A'),
            card('MEDIA', 'A'),
            card('BASE', 'A'),
        ]);
        const colorRun = evaluateConfig([
            card('INSTITUTION', '7'),
            card('INSTITUTION', '8'),
            card('INSTITUTION', '9'),
        ]);
        expect(compareConfig(totalMandate, colorRun)).toBe(-1);
        expect(compareConfig(colorRun, totalMandate)).toBe(1);
    });

    it('same type uses total value tiebreaker', () => {
        const higher = evaluateConfig([
            card('INSTITUTION', '8'),
            card('INSTITUTION', '9'),
            card('INSTITUTION', '10'),
        ]);
        const lower = evaluateConfig([
            card('MEDIA', '5'),
            card('MEDIA', '6'),
            card('MEDIA', '7'),
        ]);
        expect(compareConfig(higher, lower)).toBe(-1);
    });

    it('PARTY uses pair value first, then kicker', () => {
        const higherPair = evaluateConfig([
            card('INSTITUTION', '9'),
            card('MEDIA', '9'),
            card('BASE', '2'),
        ]);
        const lowerPair = evaluateConfig([
            card('INSTITUTION', '8'),
            card('MEDIA', '8'),
            card('BASE', '10'),
        ]);
        expect(compareConfig(higherPair, lowerPair)).toBe(-1);

        // Same pair, higher kicker wins
        const sameHighKicker = evaluateConfig([
            card('INSTITUTION', '8'),
            card('MEDIA', '8'),
            card('BASE', '7'),
        ]);
        const sameLowKicker = evaluateConfig([
            card('CAPITAL', '8'),
            card('IDEOLOGY', '8'),
            card('LOGISTICS', '3'),
        ]);
        expect(compareConfig(sameHighKicker, sameLowKicker)).toBe(-1);
    });

    it('returns 0 for identical configurations', () => {
        const a = evaluateConfig([
            card('INSTITUTION', '5'),
            card('MEDIA', '6'),
            card('BASE', '7'),
        ]);
        const b = evaluateConfig([
            card('CAPITAL', '5'),
            card('IDEOLOGY', '6'),
            card('LOGISTICS', '7'),
        ]);
        expect(compareConfig(a, b)).toBe(0);
    });
});
