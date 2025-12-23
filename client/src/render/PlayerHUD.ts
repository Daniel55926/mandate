/**
 * PlayerHUD - Video game style player indicator bar
 * Shows 3 player tiles with active/next indicators and animations
 */

import { Container, Graphics, Text, Ticker } from 'pixi.js';
import type { Seat } from '../state/MatchStore';

// =============================================================================
// Constants
// =============================================================================

const TILE_WIDTH = 160;
const TILE_HEIGHT = 70;
const TILE_GAP = 20;
const CORNER_RADIUS = 12;

const FACTION_COLORS: Record<Seat, { bg: number; border: number; text: string }> = {
    LEFT: { bg: 0x8B1538, border: 0xE53935, text: 'LEFT' },
    RIGHT: { bg: 0x1A4B8C, border: 0x1E88E5, text: 'RIGHT' },
    INDEP: { bg: 0x8B7B00, border: 0xFDD835, text: 'INDEP' },
};

// =============================================================================
// PlayerTile - Individual player indicator
// =============================================================================

class PlayerTile extends Container {
    public seat: Seat;
    private bg: Graphics;
    private glowGraphics: Graphics;
    private nameText: Text;
    private scoreText: Text;
    private turnBadge: Graphics;
    private turnBadgeText: Text;

    private isActive: boolean = false;
    private pulsePhase: number = 0;
    private tickerCallback: ((ticker: Ticker) => void) | null = null;

    constructor(seat: Seat) {
        super();
        this.seat = seat;
        const colors = FACTION_COLORS[seat];

        // Glow layer (behind bg)
        this.glowGraphics = new Graphics();
        this.glowGraphics.alpha = 0;
        this.addChild(this.glowGraphics);

        // Background
        this.bg = new Graphics();
        this.drawBackground(false);
        this.addChild(this.bg);

        // Faction name
        this.nameText = new Text({
            text: colors.text,
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 18,
                fontWeight: 'bold',
                fill: 0xffffff,
            },
        });
        this.nameText.anchor.set(0, 0.5);
        this.nameText.x = -TILE_WIDTH / 2 + 15;
        this.nameText.y = -10;
        this.addChild(this.nameText);

        // Score
        this.scoreText = new Text({
            text: 'Score: 0',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 12,
                fill: 0xcccccc,
            },
        });
        this.scoreText.anchor.set(0, 0.5);
        this.scoreText.x = -TILE_WIDTH / 2 + 15;
        this.scoreText.y = 15;
        this.addChild(this.scoreText);

        // Turn order badge
        this.turnBadge = new Graphics();
        this.turnBadge.circle(0, 0, 14);
        this.turnBadge.fill({ color: colors.border, alpha: 0.8 });
        this.turnBadge.x = TILE_WIDTH / 2 - 25;
        this.turnBadge.y = 0;
        this.addChild(this.turnBadge);

        this.turnBadgeText = new Text({
            text: '1',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
                fontWeight: 'bold',
                fill: 0xffffff,
            },
        });
        this.turnBadgeText.anchor.set(0.5);
        this.turnBadgeText.x = this.turnBadge.x;
        this.turnBadgeText.y = this.turnBadge.y;
        this.addChild(this.turnBadgeText);
    }

    private drawBackground(active: boolean): void {
        const colors = FACTION_COLORS[this.seat];
        this.bg.clear();
        this.bg.roundRect(-TILE_WIDTH / 2, -TILE_HEIGHT / 2, TILE_WIDTH, TILE_HEIGHT, CORNER_RADIUS);
        this.bg.fill({ color: colors.bg, alpha: active ? 1 : 0.7 });
        this.bg.stroke({ width: active ? 3 : 2, color: colors.border, alpha: active ? 1 : 0.5 });
    }

    private drawGlow(): void {
        const colors = FACTION_COLORS[this.seat];
        const pulse = Math.sin(this.pulsePhase) * 0.3 + 0.7;

        this.glowGraphics.clear();

        // Multiple glow layers
        for (let i = 3; i >= 0; i--) {
            const expand = i * 4 + 4;
            this.glowGraphics.roundRect(
                -TILE_WIDTH / 2 - expand,
                -TILE_HEIGHT / 2 - expand,
                TILE_WIDTH + expand * 2,
                TILE_HEIGHT + expand * 2,
                CORNER_RADIUS + expand
            );
            this.glowGraphics.fill({ color: colors.border, alpha: (0.2 - i * 0.04) * pulse });
        }
    }

    public setActive(active: boolean): void {
        if (this.isActive === active) return;
        this.isActive = active;

        this.drawBackground(active);

        if (active) {
            // Start glow animation
            this.glowGraphics.alpha = 1;
            this.pulsePhase = 0;
            this.scale.set(1.05);

            const animate = () => {
                if (!this.isActive) {
                    Ticker.shared.remove(animate);
                    return;
                }
                this.pulsePhase += 0.08;
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
        }
    }

    public setScore(score: number): void {
        this.scoreText.text = `Score: ${score}`;
    }

    public setTurnOrder(order: number): void {
        this.turnBadgeText.text = `${order}`;
    }

    public playScoreAnimation(): void {
        // Quick scale pulse
        this.scale.set(1.15);
        let progress = 0;
        const animate = () => {
            progress += 0.1;
            if (progress >= 1) {
                this.scale.set(this.isActive ? 1.05 : 1);
                Ticker.shared.remove(animate);
                return;
            }
            const ease = 1 - Math.pow(1 - progress, 3);
            this.scale.set(1.15 - 0.1 * ease + (this.isActive ? 0.05 : 0));
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
        const infoX = totalWidth / 2 + 40;

        this.roundText = new Text({
            text: 'Round 1/3',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 16,
                fontWeight: 'bold',
                fill: 0xffffff,
            },
        });
        this.roundText.anchor.set(0, 0.5);
        this.roundText.x = infoX;
        this.roundText.y = -10;
        this.addChild(this.roundText);

        this.turnText = new Text({
            text: 'Turn 1/21',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 12,
                fill: 0xaaaaaa,
            },
        });
        this.turnText.anchor.set(0, 0.5);
        this.turnText.x = infoX;
        this.turnText.y = 12;
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
        // Flash all tiles
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
