/**
 * TurnStack - Shows cumulative played cards as a stacked pile
 * Uses full-size card sprites scaled down
 */

import { Container, Graphics, Text, Ticker, Sprite, Texture } from 'pixi.js';
import type { Seat, CardInfo } from '../state/MatchStore';
import { COLORS } from '../main';
import { AssetLoader } from '../assets/AssetLoader';

// =============================================================================
// Constants
// =============================================================================

const STACK_SCALE = 0.7;
const CARD_WIDTH = 70 * STACK_SCALE;
const CARD_HEIGHT = 100 * STACK_SCALE;
const OFFSET_X = 0;
const OFFSET_Y = 28; // Vertical stack revealing header
const MAX_VISIBLE = 10;

// =============================================================================
// TurnStack Component
// =============================================================================

export class TurnStack extends Container {
    // Static popup layer for global z-ordering (set by MatchScene)
    public static popupLayer: Container | null = null;

    public seat: Seat;
    private cards: CardInfo[] = [];
    private cardContainers: Container[] = [];
    private isActive: boolean = false;

    // Animation state
    private pulseProgress: number = 0;
    private tickerCallback: ((ticker: Ticker) => void) | null = null;

    // Glow overlay
    private glowGraphics: Graphics;

    // Hover popup for expanded card view
    private hoverPopup: Container | null = null;

    constructor(seat: Seat) {
        super();
        this.seat = seat;

        // Glow behind cards
        this.glowGraphics = new Graphics();
        this.glowGraphics.alpha = 0;
        this.addChild(this.glowGraphics);

        // Enable interaction for hover
        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.on('pointerenter', this.onHoverStart, this);
        this.on('pointerleave', this.onHoverEnd, this);
    }

    // =========================================================================
    // Public API
    // =========================================================================

    public addCard(card: CardInfo): void {
        this.cards.push(card);
        this.rebuildStack();
        this.playAddAnimation();
    }

    public setCards(cards: CardInfo[]): void {
        this.cards = [...cards];
        this.rebuildStack();
    }

    public clearCards(): void {
        this.cards = [];
        this.rebuildStack();
    }

    public setActive(active: boolean): void {
        if (this.isActive === active) return;
        this.isActive = active;

        if (active) {
            this.startPulseAnimation();
            this.alpha = 1;
            this.scale.set(1.05);
            this.drawGlow();
        } else {
            this.stopPulseAnimation();
            this.alpha = 1; // Keep fully opaque, no transparency
            this.scale.set(1);
            this.glowGraphics.alpha = 0;
        }
    }

    public getCardCount(): number {
        return this.cards.length;
    }

    // =========================================================================
    // Stack Rendering
    // =========================================================================

    private rebuildStack(): void {
        // Remove old card containers
        this.cardContainers.forEach(c => this.removeChild(c));
        this.cardContainers = [];

        // Determine visible cards (last N)
        const visibleCards = this.cards.slice(-MAX_VISIBLE);
        const hiddenCount = Math.max(0, this.cards.length - MAX_VISIBLE);

        visibleCards.forEach((card, idx) => {
            const container = this.createCardSprite(card);

            // Stack vertically downwards (OFFSET_Y positive)
            container.x = idx * OFFSET_X;
            container.y = idx * OFFSET_Y;

            // Minimal alternating rotation for organic column feel
            container.rotation = (idx % 2 === 0 ? 0.02 : -0.02);

            this.addChild(container);
            this.cardContainers.push(container);
        });

        // "+N" badge if there are hidden cards (rare with MAX_VISIBLE=10)
        if (hiddenCount > 0 && this.cardContainers.length > 0) {
            const badge = new Graphics();
            badge.circle(0, 0, 10);
            badge.fill(0x333333);
            badge.stroke({ width: 1, color: 0xffffff });

            const badgeText = new Text({
                text: `+${hiddenCount}`,
                style: {
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 9,
                    fill: 0xffffff,
                    fontWeight: 'bold',
                }
            });
            badgeText.anchor.set(0.5);

            const badgeContainer = new Container();
            badgeContainer.addChild(badge);
            badgeContainer.addChild(badgeText);

            // Position above the first visible card
            badgeContainer.x = 0;
            badgeContainer.y = -15;

            this.cardContainers[0].addChild(badgeContainer);
        }
    }

    private createCardSprite(card: CardInfo): Container {
        const container = new Container();

        // For declared crisis cards, look up the actual asset card texture
        const isDeclaredCrisis = card.kind === 'CRISIS' && card.crisis_state;

        let texture: Texture | null = null;
        if (isDeclaredCrisis) {
            // Get the texture for the declared color/value
            texture = AssetLoader.getCardTextureByColorValue(
                card.crisis_state!.declared_color,
                card.crisis_state!.declared_value
            );
        } else {
            // Normal card - use card_def_id lookup
            texture = AssetLoader.getCardTexture(card.card_def_id);
        }

        if (texture && texture !== Texture.EMPTY) {
            const sprite = new Sprite(texture);
            sprite.width = CARD_WIDTH;
            sprite.height = CARD_HEIGHT;
            sprite.anchor.set(0.5);
            container.addChild(sprite);
        } else {
            // Fallback or declared crisis: Draw as colored card
            const bg = new Graphics();
            bg.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 4);

            const colorMap: Record<string, number> = {
                INSTITUTION: COLORS.INSTITUTION,
                BASE: COLORS.BASE,
                MEDIA: COLORS.MEDIA,
                CAPITAL: COLORS.CAPITAL,
                IDEOLOGY: COLORS.IDEOLOGY,
            };

            // Determine card color
            let cardColor: number;
            if (isDeclaredCrisis) {
                // Use declared color for crisis cards
                cardColor = colorMap[card.crisis_state!.declared_color] || 0x555555;
            } else if (card.kind === 'CRISIS') {
                // Undeclared crisis card
                cardColor = 0x880000;
            } else {
                // Normal asset card
                cardColor = colorMap[card.asset_color || ''] || 0x555555;
            }

            bg.fill({ color: cardColor });
            bg.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
            container.addChild(bg);

            // Value text - Header position (Top Left)
            const val = isDeclaredCrisis
                ? card.crisis_state!.declared_value
                : (card.asset_value || '?');

            const valText = new Text({
                text: val,
                style: {
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 16,
                    fill: 0xffffff,
                    fontWeight: 'bold',
                }
            });
            valText.anchor.set(0, 0.5);
            valText.x = -CARD_WIDTH / 2 + 6;
            valText.y = -CARD_HEIGHT / 2 + 12;
            container.addChild(valText);

            // Color indicator for declared crisis or asset cards
            const colorLabel = isDeclaredCrisis
                ? card.crisis_state!.declared_color.charAt(0)
                : (card.asset_color?.charAt(0) || '');

            if (colorLabel) {
                const colorText = new Text({
                    text: colorLabel,
                    style: {
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 10,
                        fill: 0xffffff,
                    }
                });
                colorText.anchor.set(1, 0.5);
                colorText.x = CARD_WIDTH / 2 - 6;
                colorText.y = -CARD_HEIGHT / 2 + 12;
                container.addChild(colorText);
            }
        }

        return container;
    }

    // =========================================================================
    // Animations
    // =========================================================================

    private playAddAnimation(): void {
        if (this.cardContainers.length === 0) return;

        const topCard = this.cardContainers[this.cardContainers.length - 1];
        const targetY = topCard.y;

        // Start higher (relative to column)
        topCard.y = targetY - 30;
        topCard.alpha = 0;

        // Animate in
        let progress = 0;
        const animate = (ticker: Ticker) => {
            progress += ticker.deltaTime * 0.08;

            if (progress >= 1) {
                topCard.y = targetY;
                topCard.alpha = 1;
                Ticker.shared.remove(animate);
                return;
            }

            // Ease out
            const ease = 1 - Math.pow(1 - progress, 3);
            topCard.y = targetY - 30 * (1 - ease);
            topCard.alpha = ease;
        };

        Ticker.shared.add(animate);
    }

    private startPulseAnimation(): void {
        this.stopPulseAnimation();

        this.tickerCallback = (ticker: Ticker) => {
            this.pulseProgress += ticker.deltaTime * 0.03;

            // Breathing effect
            const pulse = Math.sin(this.pulseProgress * Math.PI * 2) * 0.02 + 1.05;
            this.scale.set(pulse);

            // Glow pulse
            this.glowGraphics.alpha = 0.3 + Math.sin(this.pulseProgress * Math.PI * 2) * 0.15;
        };

        Ticker.shared.add(this.tickerCallback);
    }

    private stopPulseAnimation(): void {
        if (this.tickerCallback) {
            Ticker.shared.remove(this.tickerCallback);
            this.tickerCallback = null;
        }
        this.pulseProgress = 0;
    }

    private drawGlow(): void {
        this.glowGraphics.clear();

        // Simple glow behind cards
        const count = this.cards.length;
        const width = CARD_WIDTH + 20;
        // const height = CARD_HEIGHT + 20 + ((count - 1) * OFFSET_Y); // Unused

        // Center on the stack: Stack grows down differently
        // Cards are at 0, 0..OFFSET_Y*(n-1). 
        // Center of that column is x=0, y= height/2 roughly.
        // Actually, rect should cover from top of card 0 to bottom of card N.

        const top = -CARD_HEIGHT / 2 - 10;
        // Last card y is (count-1)*OFFSET_Y. Bottom of last card is y + CARD_HEIGHT/2 + 10.
        const bottom = ((Math.min(count, MAX_VISIBLE) - 1) * OFFSET_Y) + CARD_HEIGHT / 2 + 10;
        const h = bottom - top;

        this.glowGraphics.roundRect(
            -width / 2,
            top,
            width,
            h,
            12
        );

        // Color based on seat
        const seatColors: Record<Seat, number> = {
            LEFT: 0xE53935,
            RIGHT: 0x1E88E5,
            INDEP: 0xFDD835,
        };

        this.glowGraphics.fill({ color: seatColors[this.seat], alpha: 0.4 });
    }

    // =========================================================================
    // Hover Popup (Expanded Card View)
    // =========================================================================

    private onHoverStart(): void {
        if (this.cards.length === 0) return;
        this.showHoverPopup();
    }

    private onHoverEnd(): void {
        this.hideHoverPopup();
    }

    private showHoverPopup(): void {
        if (this.hoverPopup) return;
        if (!TurnStack.popupLayer) return;

        this.hoverPopup = new Container();

        // Card layout: horizontal, side by side
        const cardSpacing = CARD_WIDTH + 8;
        const totalWidth = this.cards.length * cardSpacing - 8;
        const startX = -totalWidth / 2 + CARD_WIDTH / 2;

        // Background panel
        const bg = new Graphics();
        bg.roundRect(
            -totalWidth / 2 - 15,
            -CARD_HEIGHT / 2 - 15,
            totalWidth + 30,
            CARD_HEIGHT + 30,
            12
        );
        bg.fill({ color: 0x1a1a1a, alpha: 1 });
        bg.stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
        this.hoverPopup.addChild(bg);

        // Add cards side by side
        this.cards.forEach((card, idx) => {
            const cardSprite = this.createCardSprite(card);
            cardSprite.x = startX + idx * cardSpacing;
            cardSprite.y = 0;
            cardSprite.rotation = 0;
            this.hoverPopup!.addChild(cardSprite);
        });

        // Position popup in global coordinates above this stack
        const globalPos = this.getGlobalPosition();
        this.hoverPopup.x = globalPos.x;
        this.hoverPopup.y = globalPos.y - 120;

        // Add to global popup layer (above everything)
        TurnStack.popupLayer.addChild(this.hoverPopup);
    }

    private hideHoverPopup(): void {
        if (this.hoverPopup && TurnStack.popupLayer) {
            TurnStack.popupLayer.removeChild(this.hoverPopup);
            this.hoverPopup.destroy({ children: true });
            this.hoverPopup = null;
        }
    }
}
