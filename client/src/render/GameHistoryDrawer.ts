/**
 * GameHistoryDrawer - Left-side drawer showing game history/play log
 * Displays who played which cards, district claims, and turn info
 */

import { Container, Graphics, Text, Sprite } from 'pixi.js';
import { AssetLoader } from '../assets/AssetLoader';
import type { Seat, CardInfo } from '../state/MatchStore';

// =============================================================================
// Constants
// =============================================================================

const DRAWER_WIDTH = 320;
const DRAWER_HEIGHT = 520;
const TAB_WIDTH = 35;
const TAB_HEIGHT = 100;
const CORNER_RADIUS = 16;

// Faction colors
const SEAT_COLORS: Record<Seat, number> = {
    LEFT: 0xE53935,
    RIGHT: 0x1E88E5,
    INDEP: 0xFDD835,
};

const SEAT_NAMES: Record<Seat, string> = {
    LEFT: 'Left',
    RIGHT: 'Right',
    INDEP: 'Indep',
};

// =============================================================================
// History Entry Types
// =============================================================================

interface HistoryEntry {
    turn: number;
    type: 'CARD_PLAYED' | 'DISTRICT_CLAIMED' | 'TURN_START' | 'ROUND_START' | 'ROUND_END';
    seat: Seat;
    data: {
        card?: CardInfo;
        districtIndex?: number;
        winner?: Seat;
        roundNumber?: number;
    };
    timestamp: number;
}

// =============================================================================
// GameHistoryDrawer
// =============================================================================

export class GameHistoryDrawer extends Container {
    private isOpen: boolean = false;
    private drawerPanel: Container;
    private tab: Container;
    private targetX: number = 0;
    private contentContainer: Container;
    private scrollContainer: Container;
    private scrollMask: Graphics;
    private historyEntries: HistoryEntry[] = [];
    private entryContainers: Container[] = [];
    private scrollY: number = 0;
    private maxScrollY: number = 0;
    private isDragging: boolean = false;
    private dragStartY: number = 0;
    private scrollStartY: number = 0;

    constructor() {
        super();

        // Create the main drawer panel (starts hidden off-screen to the left)
        this.drawerPanel = new Container();
        this.contentContainer = new Container();
        this.scrollContainer = new Container();
        this.scrollMask = new Graphics();
        this.createDrawerBackground();
        this.addChild(this.drawerPanel);

        // Create the tab (visible toggle button)
        this.tab = new Container();
        this.createTab();
        this.addChild(this.tab);

        // Initial position (closed - off to the left)
        this.targetX = -DRAWER_WIDTH;
        this.drawerPanel.x = -DRAWER_WIDTH;
    }

    private createDrawerBackground(): void {
        // Background (positioned to the right of x=0, so it slides from left)
        const bg = new Graphics();
        bg.roundRect(0, 0, DRAWER_WIDTH, DRAWER_HEIGHT, CORNER_RADIUS);
        bg.fill({ color: 0x1a1a2e, alpha: 0.97 });
        bg.stroke({ width: 2, color: 0x3a3a5e });
        this.drawerPanel.addChild(bg);

        // Inner glow
        const innerGlow = new Graphics();
        innerGlow.roundRect(4, 4, DRAWER_WIDTH - 8, DRAWER_HEIGHT - 8, CORNER_RADIUS - 2);
        innerGlow.stroke({ width: 1, color: 0x4a4a7e, alpha: 0.3 });
        this.drawerPanel.addChild(innerGlow);

        // Title
        const title = new Text({
            text: 'GAME LOG',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
                fontWeight: 'bold',
                fill: 0xffffff,
                letterSpacing: 3,
            },
        });
        title.anchor.set(0.5, 0);
        title.x = DRAWER_WIDTH / 2;
        title.y = 12;
        this.drawerPanel.addChild(title);

        // Divider line
        const divider = new Graphics();
        divider.moveTo(20, 40);
        divider.lineTo(DRAWER_WIDTH - 20, 40);
        divider.stroke({ width: 1, color: 0x4a4a6e, alpha: 0.6 });
        this.drawerPanel.addChild(divider);

        // Scroll mask for content
        this.scrollMask.rect(10, 48, DRAWER_WIDTH - 20, DRAWER_HEIGHT - 70);
        this.scrollMask.fill({ color: 0xffffff });
        this.drawerPanel.addChild(this.scrollMask);

        // Content container with mask
        this.contentContainer.x = 15;
        this.contentContainer.y = 50;
        this.contentContainer.mask = this.scrollMask;
        this.drawerPanel.addChild(this.contentContainer);

        // Scroll container inside content
        this.scrollContainer.y = 0;
        this.contentContainer.addChild(this.scrollContainer);

        // Make scrollable via drag
        this.setupScrolling();

        // Empty state message
        this.renderEmptyState();
    }

    private setupScrolling(): void {
        // Interactive area for scrolling
        const hitArea = new Graphics();
        hitArea.rect(0, 48, DRAWER_WIDTH, DRAWER_HEIGHT - 70);
        hitArea.fill({ color: 0x000000, alpha: 0.001 }); // Nearly invisible but interactive
        hitArea.eventMode = 'static';
        hitArea.cursor = 'grab';
        this.drawerPanel.addChild(hitArea);

        hitArea.on('pointerdown', (e) => {
            this.isDragging = true;
            this.dragStartY = e.globalY;
            this.scrollStartY = this.scrollY;
            hitArea.cursor = 'grabbing';
        });

        hitArea.on('pointermove', (e) => {
            if (!this.isDragging) return;
            const dy = e.globalY - this.dragStartY;
            this.scrollY = Math.max(0, Math.min(this.maxScrollY, this.scrollStartY - dy));
            this.scrollContainer.y = -this.scrollY;
        });

        hitArea.on('pointerup', () => {
            this.isDragging = false;
            hitArea.cursor = 'grab';
        });

        hitArea.on('pointerupoutside', () => {
            this.isDragging = false;
            hitArea.cursor = 'grab';
        });

        // Mouse wheel scrolling
        hitArea.on('wheel', (e: WheelEvent) => {
            this.scrollY = Math.max(0, Math.min(this.maxScrollY, this.scrollY + e.deltaY * 0.5));
            this.scrollContainer.y = -this.scrollY;
        });
    }

    private renderEmptyState(): void {
        const emptyText = new Text({
            text: 'No moves yet...',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 12,
                fill: 0x666688,
                fontStyle: 'italic',
            },
        });
        emptyText.x = (DRAWER_WIDTH - 30) / 2 - emptyText.width / 2;
        emptyText.y = 50;
        this.scrollContainer.addChild(emptyText);
    }

    private createTab(): void {
        // Tab background (on right side of drawer)
        const tabBg = new Graphics();
        tabBg.roundRect(0, 0, TAB_WIDTH, TAB_HEIGHT, 10);
        tabBg.fill({ color: 0x2a2a4e, alpha: 0.95 });
        tabBg.stroke({ width: 2, color: 0x55aa55 });
        this.tab.addChild(tabBg);

        // History icon (list/log icon drawn with graphics)
        const iconGraphics = new Graphics();
        const iconCenterX = TAB_WIDTH / 2;
        const iconCenterY = TAB_HEIGHT / 2 - 12;

        // Draw 3 horizontal lines representing a list/log
        iconGraphics.moveTo(iconCenterX - 10, iconCenterY - 8);
        iconGraphics.lineTo(iconCenterX + 10, iconCenterY - 8);
        iconGraphics.stroke({ width: 2, color: 0xaaeebb });

        iconGraphics.moveTo(iconCenterX - 10, iconCenterY);
        iconGraphics.lineTo(iconCenterX + 10, iconCenterY);
        iconGraphics.stroke({ width: 2, color: 0xaaeebb });

        iconGraphics.moveTo(iconCenterX - 10, iconCenterY + 8);
        iconGraphics.lineTo(iconCenterX + 10, iconCenterY + 8);
        iconGraphics.stroke({ width: 2, color: 0xaaeebb });

        this.tab.addChild(iconGraphics);

        // Label
        const label = new Text({
            text: 'LOG',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 9,
                fontWeight: 'bold',
                fill: 0xaaeebb,
                letterSpacing: 1,
            },
        });
        label.anchor.set(0.5);
        label.x = TAB_WIDTH / 2;
        label.y = TAB_HEIGHT / 2 + 18;
        this.tab.addChild(label);

        // Position tab at left edge (tab is child of container, not panel)
        this.tab.x = 0;
        this.tab.y = DRAWER_HEIGHT / 2 - TAB_HEIGHT / 2;

        // Make interactive
        this.tab.eventMode = 'static';
        this.tab.cursor = 'pointer';
        this.tab.on('pointerdown', () => this.toggle());

        // Hover effect
        this.tab.on('pointerover', () => {
            tabBg.tint = 0xccffcc;
        });
        this.tab.on('pointerout', () => {
            tabBg.tint = 0xffffff;
        });
    }

    // =========================================================================
    // Public API - Add History Entries
    // =========================================================================

    public addCardPlayed(turn: number, seat: Seat, card: CardInfo, districtIndex: number): void {
        this.historyEntries.push({
            turn,
            type: 'CARD_PLAYED',
            seat,
            data: { card, districtIndex },
            timestamp: Date.now(),
        });
        this.renderHistory();
    }

    public addDistrictClaimed(turn: number, seat: Seat, districtIndex: number, winner: Seat): void {
        this.historyEntries.push({
            turn,
            type: 'DISTRICT_CLAIMED',
            seat,
            data: { districtIndex, winner },
            timestamp: Date.now(),
        });
        this.renderHistory();
    }

    public addRoundStart(roundNumber: number): void {
        this.historyEntries.push({
            turn: 0,
            type: 'ROUND_START',
            seat: 'LEFT', // placeholder
            data: { roundNumber },
            timestamp: Date.now(),
        });
        this.renderHistory();
    }

    public addRoundEnd(winner: Seat): void {
        this.historyEntries.push({
            turn: 0,
            type: 'ROUND_END',
            seat: winner,
            data: { winner },
            timestamp: Date.now(),
        });
        this.renderHistory();
    }

    public clearHistory(): void {
        this.historyEntries = [];
        this.renderHistory();
    }

    // =========================================================================
    // Rendering
    // =========================================================================

    private renderHistory(): void {
        // Clear existing entries
        this.scrollContainer.removeChildren();
        this.entryContainers = [];

        if (this.historyEntries.length === 0) {
            this.renderEmptyState();
            this.maxScrollY = 0;
            return;
        }

        let yOffset = 0;
        const entryHeight = 36;

        // Render in reverse order (newest first)
        const entriesToShow = [...this.historyEntries].reverse();

        for (const entry of entriesToShow) {
            const container = this.createEntryRow(entry, yOffset);
            this.scrollContainer.addChild(container);
            this.entryContainers.push(container);
            yOffset += entryHeight;
        }

        // Update max scroll
        const contentHeight = yOffset;
        const visibleHeight = DRAWER_HEIGHT - 70;
        this.maxScrollY = Math.max(0, contentHeight - visibleHeight);
    }

    private createEntryRow(entry: HistoryEntry, y: number): Container {
        const container = new Container();
        container.y = y;

        const rowWidth = DRAWER_WIDTH - 30;
        const seatColor = SEAT_COLORS[entry.seat];

        // Background stripe (alternating)
        const bgIdx = this.historyEntries.indexOf(entry);
        if (bgIdx % 2 === 0) {
            const stripe = new Graphics();
            stripe.rect(0, 0, rowWidth, 34);
            stripe.fill({ color: 0x252540, alpha: 0.5 });
            container.addChild(stripe);
        }

        // Seat indicator dot
        const dot = new Graphics();
        dot.circle(10, 17, 5);
        dot.fill({ color: seatColor });
        container.addChild(dot);

        // Format entry based on type
        let mainText = '';
        let detailText = '';

        switch (entry.type) {
            case 'CARD_PLAYED': {
                const card = entry.data.card;
                const value = card?.asset_value || card?.crisis_state?.declared_value || '?';
                const color = card?.asset_color || card?.crisis_state?.declared_color || '';
                mainText = `${SEAT_NAMES[entry.seat]} played ${value}`;
                detailText = `${color} → D${(entry.data.districtIndex || 0) + 1}`;
                break;
            }
            case 'DISTRICT_CLAIMED': {
                mainText = `D${(entry.data.districtIndex || 0) + 1} claimed!`;
                detailText = `Won by ${SEAT_NAMES[entry.data.winner || entry.seat]}`;
                break;
            }
            case 'ROUND_START': {
                mainText = `Round ${entry.data.roundNumber} started`;
                detailText = '';
                break;
            }
            case 'ROUND_END': {
                mainText = `Round ended`;
                detailText = `${SEAT_NAMES[entry.data.winner || entry.seat]} wins!`;
                break;
            }
        }

        // Main text
        const mainLabel = new Text({
            text: mainText,
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 11,
                fontWeight: 'bold',
                fill: 0xffffff,
            },
        });
        mainLabel.x = 22;
        mainLabel.y = 5;
        container.addChild(mainLabel);

        // Detail text
        if (detailText) {
            const detailLabel = new Text({
                text: detailText,
                style: {
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 9,
                    fill: 0x888899,
                },
            });
            detailLabel.x = 22;
            detailLabel.y = 19;
            container.addChild(detailLabel);
        }

        // Turn number badge (right side)
        if (entry.turn > 0) {
            const turnBadge = new Text({
                text: `T${entry.turn}`,
                style: {
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 9,
                    fill: 0x666688,
                },
            });
            turnBadge.anchor.set(1, 0);
            turnBadge.x = rowWidth - 5;
            turnBadge.y = 12;
            container.addChild(turnBadge);
        }

        // Mini card icon for card plays
        if (entry.type === 'CARD_PLAYED' && entry.data.card) {
            const card = entry.data.card;
            const colorName = card.asset_color || card.crisis_state?.declared_color || '';
            const value = card.asset_value || card.crisis_state?.declared_value || '';
            const texture = AssetLoader.getCardTextureByColorValue(colorName, value);

            if (texture) {
                const sprite = new Sprite(texture);
                sprite.anchor.set(0.5);
                sprite.scale.set(0.025);
                sprite.x = rowWidth - 25;
                sprite.y = 17;
                container.addChild(sprite);
            }
        }

        return container;
    }

    // =========================================================================
    // Toggle & Animation
    // =========================================================================

    public toggle(): void {
        this.isOpen = !this.isOpen;
        this.targetX = this.isOpen ? 0 : -DRAWER_WIDTH;
        this.animateToTarget();
    }

    private animateToTarget(): void {
        const animate = () => {
            const dx = this.targetX - this.drawerPanel.x;
            if (Math.abs(dx) < 1) {
                this.drawerPanel.x = this.targetX;
                return;
            }
            this.drawerPanel.x += dx * 0.2;
            requestAnimationFrame(animate);
        };
        animate();
    }

    public getDrawerWidth(): number {
        return DRAWER_WIDTH + TAB_WIDTH;
    }

    public getDrawerHeight(): number {
        return DRAWER_HEIGHT;
    }
}
