/**
 * OpponentHand - Hearthstone-style side hand display
 * Shows opponent's card backs in a curved/fanned layout along screen edge
 */

import { Container, Graphics, Sprite, Texture, Ticker, Assets, Text, TextStyle } from 'pixi.js';
import type { Seat } from '../state/MatchStore';

// =============================================================================
// Constants
// =============================================================================

// =============================================================================
// Constants
// =============================================================================

const CARD_WIDTH = 50;  // Smaller cards (was 60)
const CARD_HEIGHT = 70; // Smaller cards (was 84)
const CARD_RADIUS = 5;

// Curved layout - Tighter curve
const ARC_RADIUS = 250;     // Much tigher radius (was 400)
const MAX_ARC_ANGLE = 40;   // Slightly narrower spread
const STACK_OFFSET = 15;    // Visible stack offset

// Animation - Smoother, less snappy
const SPRING_STIFFNESS = 0.08; // Softer spring (was 0.12)
const DAMPING = 0.82;          // More damping (was 0.75) for smooth slide

// Faction to card back mapping
const FACTION_CARD_BACKS: Record<Seat, string> = {
    LEFT: '/card backgrounds/Red_Background.png',
    RIGHT: '/card backgrounds/Blue_Background.png',
    INDEP: '/card backgrounds/Yellow_Background.png',
};

const FACTION_GLOW_COLORS: Record<Seat, number> = {
    LEFT: 0xE53935,
    RIGHT: 0x1E88E5,
    INDEP: 0xFDD835,
};

// =============================================================================
// CardBack - Individual card with animations
// =============================================================================

class CardBack extends Container {
    private bg: Graphics;
    private sprite: Sprite | null = null;
    private glowGraphics: Graphics;
    private glowColor: number;

    // Animation state
    public targetX: number = 0;
    public targetY: number = 0;
    public targetRotation: number = 0;
    private velocityX: number = 0;
    private velocityY: number = 0;
    private velocityRot: number = 0;

    constructor(texture: Texture | null, glowColor: number) {
        super();
        this.glowColor = glowColor;

        // Glow layer (behind card)
        this.glowGraphics = new Graphics();
        this.glowGraphics.alpha = 0;
        this.addChild(this.glowGraphics);

        // Card background (fallback)
        this.bg = new Graphics();
        this.bg.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
        this.bg.fill({ color: 0x2a2a4a });
        this.bg.stroke({ width: 2, color: 0x4a4a6a });
        this.addChild(this.bg);

        // Card texture sprite
        if (texture) {
            this.sprite = new Sprite(texture);
            this.sprite.anchor.set(0.5);
            this.sprite.width = CARD_WIDTH;
            this.sprite.height = CARD_HEIGHT;
            this.addChild(this.sprite);
            this.bg.visible = false;
        }

        // Interactivity
        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.on('pointerover', this.onHoverStart, this);
        this.on('pointerout', this.onHoverEnd, this);

        // Draw glow
        this.drawGlow();
    }

    private drawGlow(): void {
        this.glowGraphics.clear();
        for (let i = 3; i >= 0; i--) {
            const expand = i * 4 + 4;
            this.glowGraphics.roundRect(
                -CARD_WIDTH / 2 - expand,
                -CARD_HEIGHT / 2 - expand,
                CARD_WIDTH + expand * 2,
                CARD_HEIGHT + expand * 2,
                CARD_RADIUS + expand
            );
            this.glowGraphics.fill({ color: this.glowColor, alpha: 0.15 - i * 0.03 });
        }
    }

    private onHoverStart(): void {
        this.glowGraphics.alpha = 1;
        this.scale.set(1.1);
        this.zIndex = 100;
    }

    private onHoverEnd(): void {
        this.glowGraphics.alpha = 0;
        this.scale.set(1);
        this.zIndex = 0;
    }

    public updatePhysics(): void {
        // Spring toward target position
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dr = this.targetRotation - this.rotation;

        this.velocityX += dx * SPRING_STIFFNESS;
        this.velocityY += dy * SPRING_STIFFNESS;
        this.velocityRot += dr * SPRING_STIFFNESS;

        this.velocityX *= DAMPING;
        this.velocityY *= DAMPING;
        this.velocityRot *= DAMPING;

        this.x += this.velocityX;
        this.y += this.velocityY;
        this.rotation += this.velocityRot;
    }
}

// =============================================================================
// OpponentHand - Main container
// =============================================================================

export class OpponentHand extends Container {
    private cards: CardBack[] = [];
    private side: 'left' | 'right';
    private seat: Seat;
    private cardTexture: Texture | null = null;
    private glowColor: number;
    private tickerCallback: ((ticker: Ticker) => void) | null = null;
    private screenHeight: number = 800;

    constructor(side: 'left' | 'right', seat: Seat) {
        super();
        this.side = side;
        this.seat = seat;
        this.glowColor = FACTION_GLOW_COLORS[seat];
        this.sortableChildren = true;

        // Load card back texture
        this.loadTexture();

        // Start physics ticker
        this.tickerCallback = () => this.updatePhysics();
        Ticker.shared.add(this.tickerCallback);
    }

    private async loadTexture(): Promise<void> {
        try {
            const path = FACTION_CARD_BACKS[this.seat];
            this.cardTexture = await Assets.load<Texture>(path);
            // Refresh existing cards with texture
            this.refreshCards();
        } catch (err) {
            console.warn(`[OpponentHand] Failed to load card back for ${this.seat}:`, err);
        }
    }

    private refreshCards(): void {
        // Rebuild cards with loaded texture
        const count = this.cards.length;
        this.removeAllCards();
        this.setCardCount(count);
    }

    private removeAllCards(): void {
        for (const card of this.cards) {
            this.removeChild(card);
            card.destroy();
        }
        this.cards = [];
    }

    public setCardCount(count: number): void {
        const currentCount = this.cards.length;

        if (count > currentCount) {
            // Add cards
            for (let i = currentCount; i < count; i++) {
                const card = new CardBack(this.cardTexture, this.glowColor);
                // Start off-screen
                card.x = this.side === 'left' ? -100 : 100;
                card.y = this.screenHeight / 2;
                this.addChild(card);
                this.cards.push(card);
            }
        } else if (count < currentCount) {
            // Remove cards (from end)
            for (let i = currentCount - 1; i >= count; i--) {
                const card = this.cards.pop();
                if (card) {
                    // Animate out then destroy
                    card.targetX = this.side === 'left' ? -100 : 100;
                    setTimeout(() => {
                        this.removeChild(card);
                        card.destroy();
                    }, 300);
                }
            }
        }

        this.updateLayout();
    }

    public updateLayout(): void {
        const count = this.cards.length;
        this.updateBadge(count);

        if (count === 0) return;

        // Calculate arc positions
        // Calculate arc positions for tighter stack
        // Clamp count for angle calculation so it doesn't fan too wide
        const visualCount = Math.min(count, 15);
        const maxAngle = Math.min(MAX_ARC_ANGLE, visualCount * 5);
        const angleStep = visualCount > 1 ? maxAngle / (visualCount - 1) : 0;
        const startAngle = -maxAngle / 2;

        // Center point on screen edge
        const centerY = this.screenHeight / 2;
        // Position closer to edge (smaller offset)
        const edgeX = this.side === 'left' ? 20 : -20;

        this.cards.forEach((card, idx) => {
            // For cards beyond visual limit, pile them on the last position
            const visualIdx = Math.min(idx, 14);

            const angle = startAngle + visualIdx * angleStep;
            const radians = (angle * Math.PI) / 180;

            // Arc position (cards fan out from edge)
            const offsetY = Math.sin(radians) * ARC_RADIUS * 0.4;
            // Tighter X hugging
            let offsetX = (1 - Math.cos(radians)) * 30 * (this.side === 'left' ? 1 : -1);

            // Add stack offset for cards that are piling up visually
            if (idx >= 15) {
                const stackDepth = idx - 14;
                offsetX += stackDepth * (this.side === 'left' ? -STACK_OFFSET : STACK_OFFSET) * 0.1;
            }

            card.targetX = edgeX + offsetX;
            card.targetY = centerY + offsetY;
            card.targetRotation = radians * (this.side === 'left' ? 0.3 : -0.3) + (this.side === 'left' ? 0.1 : -0.1);

            // Adjust z-index based on index
            card.zIndex = idx;
        });

    }

    // Badge system
    private badgeContainer: Container | null = null;
    private badgeText: Text | null = null;
    private badgeBg: Graphics | null = null;

    private updateBadge(count: number): void {
        if (!this.badgeContainer) {
            this.createBadge();
        }

        if (this.badgeText) {
            this.badgeText.text = count.toString();
        }

        if (this.badgeContainer) {
            // Hide if 0 cards
            this.badgeContainer.visible = count > 0;

            // Position badge
            const centerY = this.screenHeight / 2;
            const edgeX = this.side === 'left' ? 20 : -20;
            // Place it slightly inward from the main stack base
            const badgeOffset = this.side === 'left' ? 35 : -35; // Enough to clear the edge

            this.badgeContainer.x = edgeX + badgeOffset;
            this.badgeContainer.y = centerY;

            // Pop animation logic (resetting scale for punch)
            this.badgeContainer.scale.set(1.5);
        }
    }

    private createBadge(): void {
        this.badgeContainer = new Container();
        this.badgeBg = new Graphics();
        this.badgeBg.circle(0, 0, 14);
        this.badgeBg.fill({ color: 0x222222, alpha: 0.9 });
        this.badgeBg.stroke({ width: 2, color: this.glowColor });

        this.badgeContainer.addChild(this.badgeBg);

        const style = new TextStyle({
            fontFamily: 'Arial',
            fontSize: 16,
            fontWeight: 'bold',
            fill: this.glowColor,
            align: 'center'
        });

        this.badgeText = new Text({ text: '0', style });
        this.badgeText.anchor.set(0.5);
        this.badgeContainer.addChild(this.badgeText);

        this.addChild(this.badgeContainer);
        this.badgeContainer.zIndex = 1000; // Always on top
    }

    private updatePhysics(): void {
        for (const card of this.cards) {
            card.updatePhysics();
        }

        // Animate badge scale decay
        if (this.badgeContainer && this.badgeContainer.scale.x > 1.0) {
            this.badgeContainer.scale.x += (1.0 - this.badgeContainer.scale.x) * 0.1;
            this.badgeContainer.scale.y = this.badgeContainer.scale.x;
        }
    }

    public setScreenHeight(height: number): void {
        this.screenHeight = height;
        this.updateLayout();
    }

    public destroy(): void {
        if (this.tickerCallback) {
            Ticker.shared.remove(this.tickerCallback);
        }
        this.removeAllCards();
        super.destroy();
    }
}
