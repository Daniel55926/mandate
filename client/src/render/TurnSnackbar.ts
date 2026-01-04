/**
 * TurnSnackbar - Minimal, elegant turn indicator
 * Positioned below the HUD, shows whose turn it is
 */

import { Container, Graphics, Text, Ticker } from 'pixi.js';
import type { Seat } from '../state/MatchStore';

// =============================================================================
// Constants
// =============================================================================

const SNACKBAR_HEIGHT = 28;
const CORNER_RADIUS = 14;
const PADDING_X = 20;

const SEAT_COLORS: Record<Seat, { accent: number; name: string }> = {
    LEFT: { accent: 0xE53935, name: 'LEFT' },
    RIGHT: { accent: 0x1E88E5, name: 'RIGHT' },
    INDEP: { accent: 0xFDD835, name: 'INDEP' },
};

// =============================================================================
// TurnSnackbar
// =============================================================================

export class TurnSnackbar extends Container {
    private bg: Graphics;
    private accentDot: Graphics;
    private messageText: Text;
    private pulsePhase: number = 0;
    private isMyTurn: boolean = false;
    private activeSeat: Seat = 'LEFT';
    private tickerCallback: ((ticker: Ticker) => void) | null = null;

    constructor() {
        super();

        // Background pill (dark, minimal)
        this.bg = new Graphics();
        this.addChild(this.bg);

        // Pulsing accent dot
        this.accentDot = new Graphics();
        this.addChild(this.accentDot);

        // Message text
        this.messageText = new Text({
            text: '',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 12,
                fontWeight: '600',
                fill: 0xffffff,
                letterSpacing: 0.5,
            },
        });
        this.messageText.anchor.set(0, 0.5);
        this.addChild(this.messageText);

        // Start animation ticker
        this.tickerCallback = () => this.updateAnimation();
        Ticker.shared.add(this.tickerCallback);

        // Initially hidden
        this.visible = false;
    }

    private drawBackground(): void {
        this.bg.clear();

        // Measure text width to size pill
        const textWidth = this.messageText.width;
        const pillWidth = textWidth + PADDING_X * 2 + 20; // Extra for dot

        // Dark pill background
        this.bg.roundRect(-pillWidth / 2, -SNACKBAR_HEIGHT / 2, pillWidth, SNACKBAR_HEIGHT, CORNER_RADIUS);
        this.bg.fill({ color: 0x111111, alpha: 0.9 });

        // Subtle border
        this.bg.roundRect(-pillWidth / 2, -SNACKBAR_HEIGHT / 2, pillWidth, SNACKBAR_HEIGHT, CORNER_RADIUS);
        this.bg.stroke({ width: 1, color: 0x333333 });

        // Position text and dot
        const dotX = -pillWidth / 2 + 14;
        this.accentDot.x = dotX;
        this.messageText.x = dotX + 12;
    }

    private drawAccentDot(): void {
        const color = this.isMyTurn ? 0x2ecc71 : SEAT_COLORS[this.activeSeat].accent;
        const pulse = 0.6 + Math.sin(this.pulsePhase * 2) * 0.4;

        this.accentDot.clear();
        this.accentDot.circle(0, 0, 4);
        this.accentDot.fill({ color, alpha: pulse });

        // Outer glow ring
        if (this.isMyTurn) {
            this.accentDot.circle(0, 0, 6);
            this.accentDot.stroke({ width: 1, color: 0x2ecc71, alpha: pulse * 0.5 });
        }
    }

    private updateAnimation(): void {
        if (!this.visible) return;

        this.pulsePhase += 0.08;
        this.drawAccentDot();
    }

    public update(isMyTurn: boolean, activeSeat: Seat): void {
        this.isMyTurn = isMyTurn;
        this.activeSeat = activeSeat;

        if (isMyTurn) {
            this.messageText.text = 'Your turn';
            this.messageText.style.fill = 0xffffff;
        } else {
            const seatName = SEAT_COLORS[activeSeat].name;
            this.messageText.text = `${seatName}'s turn`;
            this.messageText.style.fill = 0x999999;
        }

        this.visible = true;
        this.drawBackground();
        this.drawAccentDot();
    }

    public hide(): void {
        this.visible = false;
    }

    public destroy(): void {
        if (this.tickerCallback) {
            Ticker.shared.remove(this.tickerCallback);
        }
        super.destroy();
    }
}
