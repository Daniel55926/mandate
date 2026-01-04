/**
 * Crisis Declaration Modal
 * Traditional Centered Modal Design with Card Icons
 */

import { Container, Graphics, Text, Ticker, Sprite } from 'pixi.js';
import type { WsClient } from '../net/WsClient';

const COLORS = {
    INSTITUTION: 0x4A90D9,
    BASE: 0x50C878,
    MEDIA: 0xFFD700,
    CAPITAL: 0xE74C3C,
    IDEOLOGY: 0x9B59B6,
    LOGISTICS: 0x7F8C8D,
    BACKGROUND: 0x000000,
    PANEL_BG: 0x1a1a1a,
    TEXT_LIGHT: 0xffffff,
    TEXT_DIM: 0x888888,
    ACCENT: 0xff3333,
};

const FACTIONS: Array<{ key: string; color: number; label: string }> = [
    { key: 'INSTITUTION', color: COLORS.INSTITUTION, label: 'I' },
    { key: 'BASE', color: COLORS.BASE, label: 'B' },
    { key: 'MEDIA', color: COLORS.MEDIA, label: 'M' },
    { key: 'CAPITAL', color: COLORS.CAPITAL, label: 'C' },
    { key: 'IDEOLOGY', color: COLORS.IDEOLOGY, label: 'Id' },
    { key: 'LOGISTICS', color: COLORS.LOGISTICS, label: 'L' },
];

const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];

export interface CrisisModalOptions {
    cardInstanceId: string;
    deadlineMs: number;
}

export class CrisisModal {
    public readonly container: Container;
    private wsClient: WsClient;

    // State
    private selectedColor: string | null = null;
    private selectedValue: string | null = null;
    private cardInstanceId: string = '';
    private deadlineMs: number = 0;

    private screenWidth: number = 1920;
    private screenHeight: number = 1080;

    // UI Elements
    private backdrop: Graphics;
    private modalPanel: Container;
    private factionButtons: Map<string, Container> = new Map();
    private valueButtons: Map<string, Container> = new Map();
    private confirmButton: Container | null = null;
    private timerText: Text | null = null;

    // Animation
    private ticker: ((ticker: Ticker) => void) | null = null;
    private onDeclareCallback: (() => void) | null = null;

    constructor(wsClient: WsClient) {
        this.wsClient = wsClient;
        this.container = new Container();
        this.container.visible = false;
        this.container.label = 'CrisisModal';

        // Full-screen backdrop that blocks interaction
        this.backdrop = new Graphics();
        this.backdrop.eventMode = 'static'; // Blocks clicks
        this.container.addChild(this.backdrop);

        // Single centered modal panel
        this.modalPanel = new Container();
        this.container.addChild(this.modalPanel);

        this.createModalContent();
    }

    private createModalContent(): void {
        const p = this.modalPanel;

        // Modal background panel
        const panelBg = new Graphics();
        panelBg.label = 'panelBg';
        panelBg.roundRect(-260, -320, 520, 640, 16);
        panelBg.fill({ color: COLORS.PANEL_BG });
        panelBg.stroke({ width: 2, color: 0x333333 });
        p.addChild(panelBg);

        // Title
        const title = new Text({
            text: 'CRISIS PROTOCOL',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 32,
                fontWeight: '900',
                fill: COLORS.ACCENT,
                letterSpacing: 4,
            }
        });
        title.anchor.set(0.5);
        title.y = -280;
        p.addChild(title);

        // Timer
        this.timerText = new Text({
            text: 'AUTO-DEPLOY: 10s',
            style: {
                fontFamily: 'Courier New, monospace',
                fontSize: 16,
                fill: COLORS.TEXT_DIM,
            }
        });
        this.timerText.anchor.set(0.5);
        this.timerText.y = -240;
        p.addChild(this.timerText);

        // Section: SELECT TARGET
        const targetLabel = new Text({
            text: 'SELECT TARGET',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
                fill: COLORS.TEXT_DIM,
                letterSpacing: 2,
            }
        });
        targetLabel.anchor.set(0.5);
        targetLabel.y = -200;
        p.addChild(targetLabel);

        // Faction buttons (3x2 grid) with card icons
        const factionBtnSize = 70;
        const factionGap = 15;
        const factionGridWidth = 3 * factionBtnSize + 2 * factionGap;
        const factionStartX = -factionGridWidth / 2 + factionBtnSize / 2;
        const factionStartY = -150;

        FACTIONS.forEach((f, i) => {
            const row = Math.floor(i / 3);
            const col = i % 3;
            const btn = this.createFactionButton(f, i);
            btn.x = factionStartX + col * (factionBtnSize + factionGap);
            btn.y = factionStartY + row * (factionBtnSize + factionGap);
            p.addChild(btn);
            this.factionButtons.set(f.key, btn);
        });

        // Section: SELECT VALUE
        const valueLabel = new Text({
            text: 'SELECT VALUE',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
                fill: COLORS.TEXT_DIM,
                letterSpacing: 2,
            }
        });
        valueLabel.anchor.set(0.5);
        valueLabel.y = 20;
        p.addChild(valueLabel);

        // Value buttons (3x3 grid)
        const valueBtnSize = 55;
        const valueGap = 10;
        const valueGridWidth = 3 * valueBtnSize + 2 * valueGap;
        const valueStartX = -valueGridWidth / 2 + valueBtnSize / 2;
        const valueStartY = 70;

        VALUES.forEach((v, i) => {
            const row = Math.floor(i / 3);
            const col = i % 3;
            const btn = this.createValueButton(v);
            btn.x = valueStartX + col * (valueBtnSize + valueGap);
            btn.y = valueStartY + row * (valueBtnSize + valueGap);
            p.addChild(btn);
            this.valueButtons.set(v, btn);
        });

        // Confirm button
        this.confirmButton = this.createConfirmButton();
        this.confirmButton.y = 270;
        p.addChild(this.confirmButton);
    }

    private createFactionButton(f: typeof FACTIONS[0], index: number): Container {
        const btn = new Container();
        const size = 70;

        const bg = new Graphics();
        bg.label = 'bg';
        bg.roundRect(-size / 2, -size / 2, size, size, 8);
        bg.fill({ color: 0x222222 });
        bg.stroke({ width: 2, color: f.color });
        btn.addChild(bg);

        // Load custom icon from /icons/{index+1}.png
        const iconPath = `/icons/${index + 1}.png`;

        import('pixi.js').then(({ Assets }) => {
            Assets.load(iconPath).then((texture) => {
                const sprite = new Sprite(texture);
                const iconSize = size - 12;
                const scale = Math.min(iconSize / sprite.width, iconSize / sprite.height);
                sprite.width = sprite.width * scale;
                sprite.height = sprite.height * scale;
                sprite.anchor.set(0.5);
                sprite.tint = f.color; // Tint with faction color
                btn.addChild(sprite);
            }).catch(() => {
                // Fallback to colored letter if icon not found
                const label = new Text({
                    text: f.label,
                    style: {
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 28,
                        fontWeight: '900',
                        fill: f.color,
                    }
                });
                label.anchor.set(0.5);
                btn.addChild(label);
            });
        });

        btn.eventMode = 'static';
        btn.cursor = 'pointer';
        btn.on('pointerup', () => this.selectColor(f.key));
        btn.on('pointerenter', () => btn.scale.set(1.1));
        btn.on('pointerleave', () => btn.scale.set(1));

        return btn;
    }

    private createValueButton(val: string): Container {
        const btn = new Container();
        const size = 55;

        const bg = new Graphics();
        bg.label = 'bg';
        bg.roundRect(-size / 2, -size / 2, size, size, 6);
        bg.fill({ color: 0x333333 });
        bg.stroke({ width: 1, color: 0x555555 });
        btn.addChild(bg);

        const label = new Text({
            text: val,
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 20,
                fontWeight: 'bold',
                fill: COLORS.TEXT_LIGHT,
            }
        });
        label.anchor.set(0.5);
        label.label = 'label';
        btn.addChild(label);

        btn.eventMode = 'static';
        btn.cursor = 'pointer';
        btn.on('pointerup', () => this.selectValue(val));
        btn.on('pointerenter', () => btn.scale.set(1.1));
        btn.on('pointerleave', () => btn.scale.set(1));

        return btn;
    }

    private createConfirmButton(): Container {
        const btn = new Container();
        const w = 240;
        const h = 50;

        const bg = new Graphics();
        bg.label = 'bg';
        bg.roundRect(-w / 2, -h / 2, w, h, 8);
        bg.fill({ color: COLORS.ACCENT });
        btn.addChild(bg);

        const label = new Text({
            text: 'INITIATE CRISIS',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 18,
                fontWeight: '900',
                fill: 0xffffff,
                letterSpacing: 2,
            }
        });
        label.anchor.set(0.5);
        btn.addChild(label);

        btn.eventMode = 'static';
        btn.cursor = 'pointer';
        btn.alpha = 0.4; // Disabled initially
        btn.on('pointerup', () => this.confirm());
        btn.on('pointerenter', () => { if (btn.alpha > 0.5) btn.scale.set(1.05); });
        btn.on('pointerleave', () => btn.scale.set(1));

        return btn;
    }

    // --- Selection Logic ---

    private selectColor(key: string): void {
        this.selectedColor = key;

        this.factionButtons.forEach((btn, k) => {
            const isSelected = k === key;
            const bg = btn.getChildByLabel('bg') as Graphics;
            const f = FACTIONS.find(fac => fac.key === k)!;
            bg.clear();
            bg.roundRect(-35, -35, 70, 70, 8);
            if (isSelected) {
                bg.fill({ color: f.color, alpha: 0.3 });
                bg.stroke({ width: 3, color: f.color });
            } else {
                bg.fill({ color: 0x222222 });
                bg.stroke({ width: 2, color: f.color });
            }
            btn.alpha = isSelected ? 1 : 0.6;
        });
        this.updateConfirmState();
    }

    private selectValue(val: string): void {
        this.selectedValue = val;

        this.valueButtons.forEach((btn, v) => {
            const isSelected = v === val;
            const bg = btn.getChildByLabel('bg') as Graphics;
            const label = btn.getChildByLabel('label') as Text;
            bg.clear();
            bg.roundRect(-27.5, -27.5, 55, 55, 6);
            if (isSelected) {
                bg.fill({ color: COLORS.ACCENT, alpha: 0.3 });
                bg.stroke({ width: 2, color: COLORS.ACCENT });
                label.style.fill = COLORS.ACCENT;
            } else {
                bg.fill({ color: 0x333333 });
                bg.stroke({ width: 1, color: 0x555555 });
                label.style.fill = COLORS.TEXT_LIGHT;
            }
            btn.alpha = isSelected ? 1 : 0.7;
        });
        this.updateConfirmState();
    }

    private updateConfirmState(): void {
        if (this.confirmButton) {
            const valid = !!this.selectedColor && !!this.selectedValue;
            this.confirmButton.alpha = valid ? 1 : 0.4;
        }
    }

    private confirm(): void {
        if (!this.selectedColor || !this.selectedValue) return;

        this.wsClient.sendIntent('DECLARE_CRISIS', {
            card_instance_id: this.cardInstanceId,
            declared_color: this.selectedColor,
            declared_value: this.selectedValue,
        });

        if (this.onDeclareCallback) this.onDeclareCallback();
        this.hide();
    }

    // --- Lifecycle ---

    public show(options: CrisisModalOptions, onDeclare?: () => void): void {
        this.cardInstanceId = options.cardInstanceId;
        this.deadlineMs = options.deadlineMs;
        this.onDeclareCallback = onDeclare || null;

        // Reset selections
        this.selectedColor = null;
        this.selectedValue = null;
        this.factionButtons.forEach(btn => btn.alpha = 1);
        this.valueButtons.forEach(btn => btn.alpha = 1);
        if (this.confirmButton) this.confirmButton.alpha = 0.4;

        // Position modal
        this.modalPanel.x = this.screenWidth / 2;
        this.modalPanel.y = this.screenHeight / 2;
        this.modalPanel.scale.set(0.9);
        this.modalPanel.alpha = 0;

        this.container.visible = true;

        // Start animation ticker
        if (!this.ticker) {
            this.ticker = (t) => this.update(t);
            Ticker.shared.add(this.ticker);
        }
    }

    public hide(): void {
        this.container.visible = false;
        if (this.ticker) {
            Ticker.shared.remove(this.ticker);
            this.ticker = null;
        }
    }

    private update(_ticker: Ticker): void {
        // Pop-in animation
        this.modalPanel.scale.x += (1 - this.modalPanel.scale.x) * 0.2;
        this.modalPanel.scale.y += (1 - this.modalPanel.scale.y) * 0.2;
        this.modalPanel.alpha += (1 - this.modalPanel.alpha) * 0.2;

        // Timer
        const remaining = Math.max(0, this.deadlineMs - Date.now());
        const seconds = Math.ceil(remaining / 1000);
        if (this.timerText) {
            this.timerText.text = `AUTO-DEPLOY: ${seconds}s`;
            this.timerText.style.fill = seconds <= 3 ? COLORS.ACCENT : COLORS.TEXT_DIM;
        }
        if (remaining <= 0 && this.container.visible) this.hide();
    }

    public resize(width: number, height: number): void {
        this.screenWidth = width;
        this.screenHeight = height;

        // Redraw backdrop to cover entire screen
        this.backdrop.clear();
        this.backdrop.rect(0, 0, width, height);
        this.backdrop.fill({ color: COLORS.BACKGROUND, alpha: 0.85 });

        // Center modal
        this.modalPanel.x = width / 2;
        this.modalPanel.y = height / 2;

        // Scale modal if screen is too small
        const scale = Math.min(1, height / 700, width / 600);
        this.modalPanel.scale.set(scale);
    }
}
