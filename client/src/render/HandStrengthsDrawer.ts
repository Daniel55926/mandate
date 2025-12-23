/**
 * HandStrengthsDrawer - Collapsible reference panel showing hand rankings
 * Uses actual card textures from the game for authentic representation
 */

import { Container, Graphics, Text, Sprite } from 'pixi.js';
import { AssetLoader } from '../assets/AssetLoader';

// =============================================================================
// Constants
// =============================================================================

const DRAWER_WIDTH = 300;
const DRAWER_HEIGHT = 520;  // Slightly taller to accommodate tabs
const TAB_WIDTH = 35;
const TAB_HEIGHT = 100;
const CORNER_RADIUS = 16;

// Mini card dimensions (scaled from full cards)
const MINI_CARD_SCALE = 0.05;  // Much smaller scale for drawer
const CARD_OVERLAP = 16;

// Card sets (all 6 colors with their meaning)
const CARD_SETS = [
    {
        color: 'INSTITUTION',
        displayName: 'Institution',
        hexColor: 0x1E88E5,  // Blue
        meaning: 'law, order, structure',
    },
    {
        color: 'BASE',
        displayName: 'Base',
        hexColor: 0x43A047,  // Green
        meaning: 'mass support, presence',
    },
    {
        color: 'MEDIA',
        displayName: 'Media',
        hexColor: 0xFDD835,  // Yellow
        meaning: 'visibility, narrative',
    },
    {
        color: 'CAPITAL',
        displayName: 'Capital',
        hexColor: 0xE53935,  // Red
        meaning: 'resources, pressure',
    },
    {
        color: 'IDEOLOGY',
        displayName: 'Ideology',
        hexColor: 0x8E24AA,  // Purple
        meaning: 'belief, coherence',
    },
    {
        color: 'LOGISTICS',
        displayName: 'Logistics',
        hexColor: 0x78909C,  // Grey
        meaning: 'organization, operations',
    },
];

// Card values in order
const CARD_VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

// Hand rankings with card examples using actual color/value combinations
const HAND_RANKINGS = [
    {
        name: 'Total Mandate',
        rank: 1,
        description: 'Three Aces',
        cards: [
            { value: 'A', color: 'INSTITUTION' },
            { value: 'A', color: 'BASE' },
            { value: 'A', color: 'CAPITAL' },
        ]
    },
    {
        name: 'Coordinated Strategy',
        rank: 2,
        description: 'Same color, consecutive',
        cards: [
            { value: '4', color: 'INSTITUTION' },
            { value: '5', color: 'INSTITUTION' },
            { value: '6', color: 'INSTITUTION' },
        ]
    },
    {
        name: 'Unified Message',
        rank: 3,
        description: 'Three same value',
        cards: [
            { value: '7', color: 'MEDIA' },
            { value: '7', color: 'BASE' },
            { value: '7', color: 'IDEOLOGY' },
        ]
    },
    {
        name: 'Aligned Resources',
        rank: 4,
        description: 'Three same color',
        cards: [
            { value: '2', color: 'BASE' },
            { value: '6', color: 'BASE' },
            { value: '9', color: 'BASE' },
        ]
    },
    {
        name: 'Momentum',
        rank: 5,
        description: 'Consecutive values',
        cards: [
            { value: '3', color: 'CAPITAL' },
            { value: '4', color: 'MEDIA' },
            { value: '5', color: 'LOGISTICS' },
        ]
    },
    {
        name: 'Party',
        rank: 6,
        description: 'Pair of same value',
        cards: [
            { value: '8', color: 'IDEOLOGY' },
            { value: '8', color: 'INSTITUTION' },
            { value: '2', color: 'LOGISTICS' },
        ]
    },
    {
        name: 'Raw Pressure',
        rank: 7,
        description: 'Sum of card values',
        cards: [
            { value: '10', color: 'CAPITAL' },
            { value: '8', color: 'MEDIA' },
            { value: '6', color: 'BASE' },
        ]
    },
];

// =============================================================================
// HandStrengthsDrawer
// =============================================================================

export class HandStrengthsDrawer extends Container {
    private isOpen: boolean = false;
    private drawerPanel: Container;
    private tab: Container;
    private targetX: number = 0;
    private contentContainer: Container;
    private activeView: 'rankings' | 'cardsets' = 'rankings';
    private tabButtonsContainer: Container;
    private rankingsTabBg: Graphics | null = null;
    private cardSetsTabBg: Graphics | null = null;

    constructor() {
        super();

        // Create the main drawer panel (starts hidden off-screen)
        this.drawerPanel = new Container();
        this.contentContainer = new Container();
        this.tabButtonsContainer = new Container();
        this.createDrawerBackground();
        this.addChild(this.drawerPanel);

        // Create the tab (visible toggle button)
        this.tab = new Container();
        this.createTab();
        this.addChild(this.tab);

        // Initial position (closed)
        this.targetX = DRAWER_WIDTH;
        this.drawerPanel.x = DRAWER_WIDTH;

        // Load content after assets are ready
        this.loadContent();
    }

    private createDrawerBackground(): void {
        // Background
        const bg = new Graphics();
        bg.roundRect(-DRAWER_WIDTH, 0, DRAWER_WIDTH, DRAWER_HEIGHT, CORNER_RADIUS);
        bg.fill({ color: 0x1a1a2e, alpha: 0.97 });
        bg.stroke({ width: 2, color: 0x3a3a5e });
        this.drawerPanel.addChild(bg);

        // Inner glow
        const innerGlow = new Graphics();
        innerGlow.roundRect(-DRAWER_WIDTH + 4, 4, DRAWER_WIDTH - 8, DRAWER_HEIGHT - 8, CORNER_RADIUS - 2);
        innerGlow.stroke({ width: 1, color: 0x4a4a7e, alpha: 0.3 });
        this.drawerPanel.addChild(innerGlow);

        // Title
        const title = new Text({
            text: 'REFERENCE',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
                fontWeight: 'bold',
                fill: 0xffffff,
                letterSpacing: 3,
            },
        });
        title.anchor.set(0.5, 0);
        title.x = -DRAWER_WIDTH / 2;
        title.y = 12;
        this.drawerPanel.addChild(title);

        // Tab buttons container
        this.createTabButtons();
        this.drawerPanel.addChild(this.tabButtonsContainer);

        // Divider line (below tabs)
        const divider = new Graphics();
        divider.moveTo(-DRAWER_WIDTH + 20, 68);
        divider.lineTo(-20, 68);
        divider.stroke({ width: 1, color: 0x4a4a6e, alpha: 0.6 });
        this.drawerPanel.addChild(divider);

        // Add content container
        this.drawerPanel.addChild(this.contentContainer);
    }

    private createTabButtons(): void {
        const tabWidth = 120;
        const tabHeight = 26;
        const tabY = 36;
        const gap = 8;
        const startX = -DRAWER_WIDTH / 2 - tabWidth - gap / 2;

        // Rankings tab
        const rankingsTab = new Container();
        this.rankingsTabBg = new Graphics();
        this.updateTabButton(this.rankingsTabBg, tabWidth, tabHeight, true);
        rankingsTab.addChild(this.rankingsTabBg);

        const rankingsLabel = new Text({
            text: 'Rankings',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 11,
                fontWeight: 'bold',
                fill: 0xffffff,
            },
        });
        rankingsLabel.anchor.set(0.5);
        rankingsLabel.x = tabWidth / 2;
        rankingsLabel.y = tabHeight / 2;
        rankingsTab.addChild(rankingsLabel);

        rankingsTab.x = startX;
        rankingsTab.y = tabY;
        rankingsTab.eventMode = 'static';
        rankingsTab.cursor = 'pointer';
        rankingsTab.on('pointerdown', () => this.switchView('rankings'));
        this.tabButtonsContainer.addChild(rankingsTab);

        // Card Sets tab
        const cardSetsTab = new Container();
        this.cardSetsTabBg = new Graphics();
        this.updateTabButton(this.cardSetsTabBg, tabWidth, tabHeight, false);
        cardSetsTab.addChild(this.cardSetsTabBg);

        const cardSetsLabel = new Text({
            text: 'Card Sets',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 11,
                fontWeight: 'bold',
                fill: 0xffffff,
            },
        });
        cardSetsLabel.anchor.set(0.5);
        cardSetsLabel.x = tabWidth / 2;
        cardSetsLabel.y = tabHeight / 2;
        cardSetsTab.addChild(cardSetsLabel);

        cardSetsTab.x = startX + tabWidth + gap;
        cardSetsTab.y = tabY;
        cardSetsTab.eventMode = 'static';
        cardSetsTab.cursor = 'pointer';
        cardSetsTab.on('pointerdown', () => this.switchView('cardsets'));
        this.tabButtonsContainer.addChild(cardSetsTab);
    }

    private updateTabButton(bg: Graphics, width: number, height: number, isActive: boolean): void {
        bg.clear();
        bg.roundRect(0, 0, width, height, 6);
        if (isActive) {
            bg.fill({ color: 0x4a4a7e });
            bg.stroke({ width: 1, color: 0x6a6aae });
        } else {
            bg.fill({ color: 0x2a2a4e });
            bg.stroke({ width: 1, color: 0x3a3a5e });
        }
    }

    private switchView(view: 'rankings' | 'cardsets'): void {
        if (this.activeView === view) return;
        this.activeView = view;

        // Update tab button states
        if (this.rankingsTabBg && this.cardSetsTabBg) {
            this.updateTabButton(this.rankingsTabBg, 120, 26, view === 'rankings');
            this.updateTabButton(this.cardSetsTabBg, 120, 26, view === 'cardsets');
        }

        // Reload content
        this.loadContent();
    }

    private async loadContent(): Promise<void> {
        // Wait for assets to be loaded
        if (!AssetLoader.isLoaded()) {
            await AssetLoader.loadCatalog();
            await AssetLoader.preloadTextures();
        }

        // Clear existing content
        this.contentContainer.removeChildren();

        if (this.activeView === 'rankings') {
            this.loadRankingsContent();
        } else {
            this.loadCardSetsContent();
        }
    }

    private loadRankingsContent(): void {
        // Create hand rankings
        let yOffset = 78;
        const rowHeight = 54;

        HAND_RANKINGS.forEach((hand) => {
            this.createHandRow(hand, yOffset);
            yOffset += rowHeight;
        });

        // Footer note
        const footerNote = new Text({
            text: 'Ties: Higher total value wins',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 11,
                fill: 0x777788,
                fontStyle: 'italic',
            },
        });
        footerNote.anchor.set(0.5, 1);
        footerNote.x = -DRAWER_WIDTH / 2;
        footerNote.y = DRAWER_HEIGHT - 12;
        this.contentContainer.addChild(footerNote);
    }

    private loadCardSetsContent(): void {
        // Create card sets rows
        let yOffset = 78;
        const rowHeight = 70;

        CARD_SETS.forEach((cardSet) => {
            this.createCardSetRow(cardSet, yOffset);
            yOffset += rowHeight;
        });

        // Footer note
        const footerNote = new Text({
            text: '63 cards total (60 assets + 3 crisis)',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 11,
                fill: 0x777788,
                fontStyle: 'italic',
            },
        });
        footerNote.anchor.set(0.5, 1);
        footerNote.x = -DRAWER_WIDTH / 2;
        footerNote.y = DRAWER_HEIGHT - 12;
        this.contentContainer.addChild(footerNote);
    }

    private createCardSetRow(cardSet: typeof CARD_SETS[0], y: number): void {
        // Color indicator circle
        const indicatorX = -DRAWER_WIDTH + 18;
        const indicator = new Graphics();
        indicator.circle(indicatorX, y + 14, 8);
        indicator.fill({ color: cardSet.hexColor });
        indicator.stroke({ width: 1, color: 0xffffff, alpha: 0.3 });
        this.contentContainer.addChild(indicator);

        // Color name
        const nameText = new Text({
            text: cardSet.displayName,
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 12,
                fontWeight: 'bold',
                fill: cardSet.hexColor,
            },
        });
        nameText.x = -DRAWER_WIDTH + 32;
        nameText.y = y + 5;
        this.contentContainer.addChild(nameText);

        // Meaning description
        const meaningText = new Text({
            text: cardSet.meaning,
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 9,
                fill: 0x888899,
            },
        });
        meaningText.x = -DRAWER_WIDTH + 32;
        meaningText.y = y + 20;
        this.contentContainer.addChild(meaningText);

        // Card thumbnails (A, 2-10)
        const miniCardScale = 0.035;  // Even smaller for fitting 10 cards
        const cardSpacing = 25;
        const cardsStartX = -DRAWER_WIDTH + 15;
        const cardsY = y + 50;

        CARD_VALUES.forEach((value, idx) => {
            const texture = AssetLoader.getCardTextureByColorValue(cardSet.color, value);
            if (texture) {
                const sprite = new Sprite(texture);
                sprite.anchor.set(0.5);
                sprite.scale.set(miniCardScale);
                sprite.x = cardsStartX + idx * cardSpacing;
                sprite.y = cardsY;
                this.contentContainer.addChild(sprite);
            } else {
                // Fallback placeholder
                const placeholder = new Graphics();
                placeholder.roundRect(-10, -14, 20, 28, 2);
                placeholder.fill({ color: cardSet.hexColor, alpha: 0.3 });
                placeholder.stroke({ width: 1, color: cardSet.hexColor, alpha: 0.5 });
                placeholder.x = cardsStartX + idx * cardSpacing;
                placeholder.y = cardsY;
                this.contentContainer.addChild(placeholder);
            }
        });
    }

    private createHandRow(hand: typeof HAND_RANKINGS[0], y: number): void {
        const rowCenterY = y + 22;

        // Rank badge
        const badgeSize = 26;
        const badgeX = -DRAWER_WIDTH + 22;
        const badge = new Graphics();
        badge.circle(badgeX, rowCenterY, badgeSize / 2);
        badge.fill({ color: this.getRankColor(hand.rank) });
        badge.stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
        this.contentContainer.addChild(badge);

        const rankText = new Text({
            text: `${hand.rank}`,
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 13,
                fontWeight: 'bold',
                fill: hand.rank <= 3 ? 0x111111 : 0xffffff,
            },
        });
        rankText.anchor.set(0.5);
        rankText.x = badgeX;
        rankText.y = rowCenterY;
        this.contentContainer.addChild(rankText);

        // Hand name
        const nameText = new Text({
            text: hand.name,
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 12,
                fontWeight: 'bold',
                fill: 0xffffff,
            },
        });
        nameText.x = -DRAWER_WIDTH + 42;
        nameText.y = y + 6;
        this.contentContainer.addChild(nameText);

        // Description
        const descText = new Text({
            text: hand.description,
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 9,
                fill: 0x888899,
            },
        });
        descText.x = -DRAWER_WIDTH + 42;
        descText.y = y + 22;
        this.contentContainer.addChild(descText);

        // Visual card examples using REAL card textures
        const cardsStartX = -95;
        hand.cards.forEach((card, idx) => {
            const miniCard = this.createMiniCardSprite(card.value, card.color);
            if (miniCard) {
                miniCard.x = cardsStartX + idx * CARD_OVERLAP;
                miniCard.y = y + rowCenterY - y;  // Center vertically
                this.contentContainer.addChild(miniCard);
            }
        });
    }

    private createMiniCardSprite(value: string, colorName: string): Container | null {
        const container = new Container();

        // Try to get actual card texture
        const texture = AssetLoader.getCardTextureByColorValue(colorName, value);

        if (texture) {
            // Use actual card texture as sprite
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.scale.set(MINI_CARD_SCALE);
            container.addChild(sprite);
        } else {
            // Fallback: create a simple placeholder
            const fallback = new Graphics();
            fallback.roundRect(-18, -25, 36, 50, 4);
            fallback.fill({ color: 0x444466 });
            fallback.stroke({ width: 1, color: 0x666688 });
            container.addChild(fallback);

            const valueText = new Text({
                text: value,
                style: {
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 12,
                    fontWeight: 'bold',
                    fill: 0xffffff,
                },
            });
            valueText.anchor.set(0.5);
            container.addChild(valueText);
        }

        return container;
    }

    private createTab(): void {
        // Tab background - positioned to the LEFT of container origin so it sticks out
        // when the container is at the right edge of the screen
        const tabBg = new Graphics();
        tabBg.roundRect(0, 0, TAB_WIDTH, TAB_HEIGHT, 10);
        tabBg.fill({ color: 0x2a2a4e, alpha: 0.95 });
        tabBg.stroke({ width: 2, color: 0x5555aa });
        this.tab.addChild(tabBg);

        // "?" icon
        const icon = new Text({
            text: '?',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 24,
                fontWeight: 'bold',
                fill: 0xffffff,
            },
        });
        icon.anchor.set(0.5);
        icon.x = TAB_WIDTH / 2;
        icon.y = TAB_HEIGHT / 2 - 12;
        this.tab.addChild(icon);

        // Label
        const label = new Text({
            text: 'HANDS',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 9,
                fontWeight: 'bold',
                fill: 0xaabbee,
                letterSpacing: 1,
            },
        });
        label.anchor.set(0.5);
        label.x = TAB_WIDTH / 2;
        label.y = TAB_HEIGHT / 2 + 18;
        this.tab.addChild(label);

        // Position tab to the LEFT of container origin (extends into visible screen)
        this.tab.x = -TAB_WIDTH;
        this.tab.y = DRAWER_HEIGHT / 2 - TAB_HEIGHT / 2;

        // Make interactive
        this.tab.eventMode = 'static';
        this.tab.cursor = 'pointer';
        this.tab.on('pointerdown', () => this.toggle());

        // Hover effect
        this.tab.on('pointerover', () => {
            tabBg.tint = 0xccccff;
        });
        this.tab.on('pointerout', () => {
            tabBg.tint = 0xffffff;
        });
    }

    private getRankColor(rank: number): number {
        if (rank === 1) return 0xffd700;
        if (rank === 2) return 0xc0c0c0;
        if (rank === 3) return 0xcd7f32;
        if (rank <= 5) return 0x607d8b;
        return 0x546e7a;
    }

    public toggle(): void {
        this.isOpen = !this.isOpen;
        this.targetX = this.isOpen ? 0 : DRAWER_WIDTH;
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
