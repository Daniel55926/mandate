/**
 * PlayerHUD - Premium glass-card style player indicator
 * Shows 3 player tiles with elegant active indicators and animations
 */

import { Container, Graphics, Text, Ticker } from 'pixi.js';
import type { Seat } from '../state/MatchStore';

// =============================================================================
// Constants
// =============================================================================

const TILE_WIDTH = 140;
const TILE_HEIGHT = 55;
const TILE_GAP = 12;
const CORNER_RADIUS = 8;
const ACCENT_WIDTH = 4;

const FACTION_COLORS: Record<Seat, { accent: number; glow: number; name: string }> = {
    LEFT: { accent: 0xE53935, glow: 0xE53935, name: 'LEFT' },
    RIGHT: { accent: 0x1E88E5, glow: 0x1E88E5, name: 'RIGHT' },
    INDEP: { accent: 0xFDD835, glow: 0xFDD835, name: 'INDEP' },
};

// =============================================================================
// PlayerTile - Individual player indicator (Glass-card design)
// =============================================================================

class PlayerTile extends Container {
    public seat: Seat;
    private bg: Graphics;
    private accentBar: Graphics;
    private glowGraphics: Graphics;
    private nameText: Text;
    private statsText: Text;
    private turnBadge: Graphics;
    private turnBadgeText: Text;

    private isActive: boolean = false;
    private pulsePhase: number = 0;
    private tickerCallback: ((ticker: Ticker) => void) | null = null;

    private districts: number = 0;
    private roundsWon: number = 0;

    constructor(seat: Seat) {
        super();
        this.seat = seat;
        const colors = FACTION_COLORS[seat];

        // Glow layer (behind everything)
        this.glowGraphics = new Graphics();
        this.glowGraphics.alpha = 0;
        this.addChild(this.glowGraphics);

        // Main background (glass card)
        this.bg = new Graphics();
        this.drawBackground(false);
        this.addChild(this.bg);

        // Faction accent bar (left edge)
        this.accentBar = new Graphics();
        this.drawAccentBar(false);
        this.addChild(this.accentBar);

        // Faction name (bold, left-aligned)
        this.nameText = new Text({
            text: colors.name,
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 16,
                fontWeight: '700',
                fill: 0xffffff,
                letterSpacing: 1,
            },
        });
        this.nameText.anchor.set(0, 0.5);
        this.nameText.x = -TILE_WIDTH / 2 + ACCENT_WIDTH + 12;
        this.nameText.y = -10;
        this.addChild(this.nameText);

        // Stats text (Districts / Rounds)
        this.statsText = new Text({
            text: '0 districts · 0/2 rounds',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 10,
                fill: 0x888888,
            },
        });
        this.statsText.anchor.set(0, 0.5);
        this.statsText.x = -TILE_WIDTH / 2 + ACCENT_WIDTH + 12;
        this.statsText.y = 10;
        this.addChild(this.statsText);

        // Turn order badge (right side)
        this.turnBadge = new Graphics();
        this.turnBadge.circle(0, 0, 12);
        this.turnBadge.fill({ color: 0x333333 });
        this.turnBadge.stroke({ width: 2, color: colors.accent, alpha: 0.6 });
        this.turnBadge.x = TILE_WIDTH / 2 - 20;
        this.turnBadge.y = 0;
        this.addChild(this.turnBadge);

        this.turnBadgeText = new Text({
            text: '1',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 11,
                fontWeight: '600',
                fill: 0xcccccc,
            },
        });
        this.turnBadgeText.anchor.set(0.5);
        this.turnBadgeText.x = this.turnBadge.x;
        this.turnBadgeText.y = this.turnBadge.y;
        this.addChild(this.turnBadgeText);
    }

    private drawBackground(active: boolean): void {
        this.bg.clear();

        // Glass card effect: dark semi-transparent bg
        this.bg.roundRect(-TILE_WIDTH / 2, -TILE_HEIGHT / 2, TILE_WIDTH, TILE_HEIGHT, CORNER_RADIUS);
        this.bg.fill({ color: 0x1a1a1a, alpha: active ? 0.95 : 0.8 });

        // Subtle border
        this.bg.roundRect(-TILE_WIDTH / 2, -TILE_HEIGHT / 2, TILE_WIDTH, TILE_HEIGHT, CORNER_RADIUS);
        this.bg.stroke({ width: 1, color: active ? 0x444444 : 0x333333 });
    }

    private drawAccentBar(active: boolean): void {
        const colors = FACTION_COLORS[this.seat];
        this.accentBar.clear();

        // Left accent bar
        this.accentBar.roundRect(
            -TILE_WIDTH / 2,
            -TILE_HEIGHT / 2 + 4,
            ACCENT_WIDTH,
            TILE_HEIGHT - 8,
            2
        );
        this.accentBar.fill({ color: colors.accent, alpha: active ? 1 : 0.6 });
    }

    private drawGlow(): void {
        const colors = FACTION_COLORS[this.seat];
        const pulse = Math.sin(this.pulsePhase) * 0.3 + 0.7;

        this.glowGraphics.clear();

        // Soft outer glow
        for (let i = 3; i >= 0; i--) {
            const expand = i * 3 + 2;
            this.glowGraphics.roundRect(
                -TILE_WIDTH / 2 - expand,
                -TILE_HEIGHT / 2 - expand,
                TILE_WIDTH + expand * 2,
                TILE_HEIGHT + expand * 2,
                CORNER_RADIUS + expand
            );
            this.glowGraphics.fill({ color: colors.glow, alpha: (0.15 - i * 0.03) * pulse });
        }
    }

    public setActive(active: boolean): void {
        if (this.isActive === active) return;
        this.isActive = active;

        this.drawBackground(active);
        this.drawAccentBar(active);

        // Update text brightness
        this.nameText.style.fill = active ? 0xffffff : 0xcccccc;
        this.statsText.style.fill = active ? 0xaaaaaa : 0x666666;

        if (active) {
            // Start glow animation
            this.glowGraphics.alpha = 1;
            this.pulsePhase = 0;
            this.scale.set(1.05);
            this.zIndex = 100;

            const animate = () => {
                if (!this.isActive) {
                    Ticker.shared.remove(animate);
                    return;
                }
                this.pulsePhase += 0.06;
                this.drawGlow();
            };
            this.tickerCallback = animate;
            Ticker.shared.add(animate);
        } else {
            // Stop animation
            if (this.tickerCallback) {
                Ticker.shared.remove(this.tickerCallback);
                this.tickerCallback = null;
            }
            this.glowGraphics.alpha = 0;
            this.scale.set(1);
            this.zIndex = 0;
        }
    }

    public setScore(score: number): void {
        this.districts = score;
        this.updateStatsText();
    }

    public setRoundsWon(wins: number): void {
        this.roundsWon = wins;
        this.updateStatsText();
    }

    private updateStatsText(): void {
        this.statsText.text = `${this.districts} dist · ${this.roundsWon}/2 rounds`;
    }

    public setTurnOrder(order: number): void {
        this.turnBadgeText.text = `${order}`;
    }

    public playScoreAnimation(): void {
        this.scale.set(1.1);
        let progress = 0;
        const animate = () => {
            progress += 0.1;
            if (progress >= 1) {
                this.scale.set(this.isActive ? 1.05 : 1);
                Ticker.shared.remove(animate);
                return;
            }
            const ease = 1 - Math.pow(1 - progress, 3);
            this.scale.set(1.1 - 0.05 * ease + (this.isActive ? 0.05 : 0));
        };
        Ticker.shared.add(animate);
    }
}

// =============================================================================
// PlayerHUD - Main container
// =============================================================================

export class PlayerHUD extends Container {
    private tiles: Map<Seat, PlayerTile> = new Map();
    private roundText: Text;
    private turnText: Text;
    private currentActiveSeat: Seat | null = null;
    private currentRound: number = 1;

    constructor() {
        super();
        this.sortableChildren = true;

        // Create 3 player tiles
        const seats: Seat[] = ['LEFT', 'RIGHT', 'INDEP'];
        const totalWidth = seats.length * TILE_WIDTH + (seats.length - 1) * TILE_GAP;
        const startX = -totalWidth / 2 + TILE_WIDTH / 2;

        seats.forEach((seat, idx) => {
            const tile = new PlayerTile(seat);
            tile.x = startX + idx * (TILE_WIDTH + TILE_GAP);
            tile.y = 0;
            tile.setTurnOrder(idx + 1);
            this.tiles.set(seat, tile);
            this.addChild(tile);
        });

        // Round/Turn indicator (right side)
        const infoX = totalWidth / 2 + 30;

        this.roundText = new Text({
            text: 'Round 1/3',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
                fontWeight: '600',
                fill: 0xffffff,
            },
        });
        this.roundText.anchor.set(0, 0.5);
        this.roundText.x = infoX;
        this.roundText.y = -8;
        this.addChild(this.roundText);

        this.turnText = new Text({
            text: 'Turn 1/21',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 11,
                fill: 0x777777,
            },
        });
        this.turnText.anchor.set(0, 0.5);
        this.turnText.x = infoX;
        this.turnText.y = 10;
        this.addChild(this.turnText);
    }

    public setActiveSeat(seat: Seat): void {
        if (this.currentActiveSeat === seat) return;

        // Deactivate previous
        if (this.currentActiveSeat) {
            this.tiles.get(this.currentActiveSeat)?.setActive(false);
        }

        // Activate new
        this.currentActiveSeat = seat;
        this.tiles.get(seat)?.setActive(true);
    }

    public updateScores(scores: Record<Seat, number>): void {
        this.tiles.forEach((tile, seat) => {
            const newScore = scores[seat] || 0;
            tile.setScore(newScore);
        });
    }

    public updateRoundsWon(matchScore: Record<Seat, number>): void {
        this.tiles.forEach((tile, seat) => {
            const wins = matchScore[seat] || 0;
            tile.setRoundsWon(wins);
        });
    }

    public updateRound(round: number, totalRounds: number): void {
        const oldRound = this.currentRound;
        this.currentRound = round;
        this.roundText.text = `Round ${round}/${totalRounds}`;

        if (round > oldRound) {
            this.playRoundChangeAnimation();
        }
    }

    public updateTurn(turn: number, totalTurns: number): void {
        this.turnText.text = `Turn ${turn}/${totalTurns}`;
    }

    private playRoundChangeAnimation(): void {
        this.tiles.forEach(tile => {
            tile.alpha = 0.5;
            let progress = 0;
            const animate = () => {
                progress += 0.05;
                if (progress >= 1) {
                    tile.alpha = 1;
                    Ticker.shared.remove(animate);
                    return;
                }
                tile.alpha = 0.5 + 0.5 * Math.sin(progress * Math.PI * 3);
            };
            Ticker.shared.add(animate);
        });
    }
}
