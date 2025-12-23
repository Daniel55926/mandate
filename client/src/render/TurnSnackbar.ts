/**
 * TurnSnackbar - Subtle turn indicator showing "Your turn" / "Opponent thinking..."
 */

import { Container, Graphics, Text, Ticker } from 'pixi.js';
import type { Seat } from '../state/MatchStore';

// =============================================================================
// Constants
// =============================================================================

const SNACKBAR_WIDTH = 200;
const SNACKBAR_HEIGHT = 40;
const CORNER_RADIUS = 20;

const SEAT_COLORS: Record<Seat, number> = {
    LEFT: 0xE53935,
    RIGHT: 0x1E88E5,
    INDEP: 0xFDD835,
};

// =============================================================================
// TurnSnackbar
// =============================================================================

export class TurnSnackbar extends Container {
    private bg: Graphics;
    private messageText: Text;
    private pulsePhase: number = 0;
    private isMyTurn: boolean = false;
    private activeSeat: Seat = 'LEFT';
    private tickerCallback: ((ticker: Ticker) => void) | null = null;

    constructor() {
        super();

        // Background pill
        this.bg = new Graphics();
        this.drawBackground();
        this.addChild(this.bg);

        // Message text
        this.messageText = new Text({
            text: '',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
                fontWeight: 'bold',
                fill: 0xffffff,
            },
        });
        this.messageText.anchor.set(0.5);
        this.addChild(this.messageText);

        // Start animation ticker
        this.tickerCallback = () => this.updateAnimation();
        Ticker.shared.add(this.tickerCallback);

        // Initially hidden
        this.visible = false;
    }

    private drawBackground(): void {
        this.bg.clear();

        const color = this.isMyTurn ? 0x2ecc71 : SEAT_COLORS[this.activeSeat];
        const pulse = this.isMyTurn ? Math.sin(this.pulsePhase) * 0.1 + 0.9 : 0.8;

        this.bg.roundRect(-SNACKBAR_WIDTH / 2, -SNACKBAR_HEIGHT / 2, SNACKBAR_WIDTH, SNACKBAR_HEIGHT, CORNER_RADIUS);
        this.bg.fill({ color: 0x1a1a2e, alpha: 0.95 });
        this.bg.stroke({ width: 2, color, alpha: pulse });

        // Subtle inner glow for "Your turn"
        if (this.isMyTurn) {
            this.bg.roundRect(
                -SNACKBAR_WIDTH / 2 + 2,
                -SNACKBAR_HEIGHT / 2 + 2,
                SNACKBAR_WIDTH - 4,
                SNACKBAR_HEIGHT - 4,
                CORNER_RADIUS - 2
            );
            this.bg.fill({ color, alpha: 0.1 * pulse });
        }
    }

    private updateAnimation(): void {
        if (!this.visible) return;

        this.pulsePhase += 0.08;
        this.drawBackground();

        // Subtle scale pulse for "Your turn"
        if (this.isMyTurn) {
            const scale = 1 + Math.sin(this.pulsePhase) * 0.02;
            this.scale.set(scale);
        } else {
            this.scale.set(1);
        }
    }

    public update(isMyTurn: boolean, activeSeat: Seat): void {
        this.isMyTurn = isMyTurn;
        this.activeSeat = activeSeat;

        if (isMyTurn) {
            this.messageText.text = '→ Your turn';
            this.messageText.style.fill = 0x2ecc71;
        } else {
            const seatName = activeSeat === 'LEFT' ? 'Left' : activeSeat === 'RIGHT' ? 'Right' : 'Indep';
            this.messageText.text = `${seatName} thinking...`;
            this.messageText.style.fill = SEAT_COLORS[activeSeat];
        }

        this.visible = true;
        this.drawBackground();
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
