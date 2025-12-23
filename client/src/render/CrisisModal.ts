/**
 * Crisis Declaration Modal
 * Shows color and value picker when a crisis card is played
 */

import { Container, Graphics, Text } from 'pixi.js';
import type { WsClient } from '../net/WsClient';

const COLORS = {
    INSTITUTION: 0x4A90D9,
    BASE: 0x50C878,
    MEDIA: 0xFFD700,
    CAPITAL: 0xE74C3C,
    IDEOLOGY: 0x9B59B6,
    LOGISTICS: 0x7F8C8D,
    BACKGROUND: 0x1a1a1a,
    TEXT_LIGHT: 0xffffff,
    BUTTON_DISABLED: 0x333333,
};

const ASSET_COLORS: Array<{ key: string; color: number; label: string }> = [
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

    private selectedColor: string | null = null;
    private selectedValue: string | null = null;
    private cardInstanceId: string = '';
    private deadlineMs: number = 0;

    private colorButtons: Map<string, Container> = new Map();
    private valueButtons: Map<string, Container> = new Map();
    private confirmButton: Container | null = null;
    private timerText: Text | null = null;
    private timerInterval: ReturnType<typeof setInterval> | null = null;

    private onDeclareCallback: (() => void) | null = null;

    constructor(wsClient: WsClient) {
        this.wsClient = wsClient;
        this.container = new Container();
        this.container.visible = false;

        this.createModal();
    }

    private createModal(): void {
        // Backdrop
        const backdrop = new Graphics();
        backdrop.rect(0, 0, 1920, 1080);
        backdrop.fill({ color: 0x000000, alpha: 0.7 });
        backdrop.eventMode = 'static';
        backdrop.cursor = 'default';
        this.container.addChild(backdrop);

        // Modal container
        const modal = new Container();
        modal.x = 960;
        modal.y = 540;
        this.container.addChild(modal);

        // Modal background
        const modalBg = new Graphics();
        modalBg.roundRect(-220, -200, 440, 400, 16);
        modalBg.fill({ color: COLORS.BACKGROUND });
        modalBg.stroke({ width: 2, color: 0x444444 });
        modal.addChild(modalBg);

        // Title
        const title = new Text({
            text: 'Declare Crisis Card',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 20,
                fill: COLORS.TEXT_LIGHT,
                fontWeight: 'bold',
            },
        });
        title.anchor.set(0.5);
        title.y = -160;
        modal.addChild(title);

        // Timer
        this.timerText = new Text({
            text: '10s',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 16,
                fill: 0xff6b6b,
            },
        });
        this.timerText.anchor.set(0.5);
        this.timerText.y = -130;
        modal.addChild(this.timerText);

        // Color label
        const colorLabel = new Text({
            text: 'Select Color',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
                fill: 0x888888,
            },
        });
        colorLabel.anchor.set(0.5);
        colorLabel.y = -100;
        modal.addChild(colorLabel);

        // Color buttons
        ASSET_COLORS.forEach((c, i) => {
            const btn = this.createButton(c.label, c.color, 50, () => this.selectColor(c.key));
            btn.x = (i - 2.5) * 60;
            btn.y = -50;
            btn.label = `color_${c.key}`;
            modal.addChild(btn);
            this.colorButtons.set(c.key, btn);
        });

        // Value label
        const valueLabel = new Text({
            text: 'Select Value (2-10)',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
                fill: 0x888888,
            },
        });
        valueLabel.anchor.set(0.5);
        valueLabel.y = 10;
        modal.addChild(valueLabel);

        // Value buttons
        VALUES.forEach((v, i) => {
            const btn = this.createButton(v, 0x444444, 40, () => this.selectValue(v));
            btn.x = (i - 4) * 45;
            btn.y = 60;
            btn.label = `value_${v}`;
            modal.addChild(btn);
            this.valueButtons.set(v, btn);
        });

        // Confirm button
        this.confirmButton = this.createButton('Confirm', 0x50C878, 120, () => this.confirm());
        this.confirmButton.y = 140;
        this.confirmButton.alpha = 0.3;
        modal.addChild(this.confirmButton);
    }

    private createButton(
        label: string,
        color: number,
        width: number,
        onClick: () => void
    ): Container {
        const btn = new Container();
        const bg = new Graphics();
        bg.roundRect(-width / 2, -20, width, 40, 8);
        bg.fill({ color });
        btn.addChild(bg);

        const text = new Text({
            text: label,
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
                fill: COLORS.TEXT_LIGHT,
                fontWeight: 'bold',
            },
        });
        text.anchor.set(0.5);
        btn.addChild(text);

        btn.eventMode = 'static';
        btn.cursor = 'pointer';
        btn.on('pointerup', onClick);

        return btn;
    }

    private selectColor(color: string): void {
        this.selectedColor = color;

        // Update button visuals
        this.colorButtons.forEach((btn, key) => {
            const bg = btn.getChildAt(0) as Graphics;
            const c = ASSET_COLORS.find(a => a.key === key)!;
            bg.clear();
            bg.roundRect(-25, -20, 50, 40, 8);
            bg.fill({ color: c.color, alpha: key === color ? 1 : 0.5 });
            if (key === color) {
                bg.stroke({ width: 3, color: 0xffffff });
            }
        });

        this.updateConfirmButton();
    }

    private selectValue(value: string): void {
        this.selectedValue = value;

        // Update button visuals
        this.valueButtons.forEach((btn, key) => {
            const bg = btn.getChildAt(0) as Graphics;
            bg.clear();
            bg.roundRect(-20, -20, 40, 40, 8);
            bg.fill({ color: key === value ? 0x666666 : 0x444444 });
            if (key === value) {
                bg.stroke({ width: 2, color: 0xffffff });
            }
        });

        this.updateConfirmButton();
    }

    private updateConfirmButton(): void {
        if (this.confirmButton) {
            this.confirmButton.alpha = this.selectedColor && this.selectedValue ? 1 : 0.3;
        }
    }

    private confirm(): void {
        if (!this.selectedColor || !this.selectedValue) return;

        this.wsClient.sendIntent('DECLARE_CRISIS', {
            card_instance_id: this.cardInstanceId,
            declared_color: this.selectedColor,
            declared_value: this.selectedValue,
        });

        if (this.onDeclareCallback) {
            this.onDeclareCallback();
        }
    }

    public show(options: CrisisModalOptions, onDeclare?: () => void): void {
        this.cardInstanceId = options.cardInstanceId;
        this.deadlineMs = options.deadlineMs;
        this.selectedColor = null;
        this.selectedValue = null;
        this.onDeclareCallback = onDeclare || null;

        // Reset button visuals
        this.colorButtons.forEach((btn, key) => {
            const bg = btn.getChildAt(0) as Graphics;
            const c = ASSET_COLORS.find(a => a.key === key)!;
            bg.clear();
            bg.roundRect(-25, -20, 50, 40, 8);
            bg.fill({ color: c.color, alpha: 0.5 });
        });

        this.valueButtons.forEach((btn) => {
            const bg = btn.getChildAt(0) as Graphics;
            bg.clear();
            bg.roundRect(-20, -20, 40, 40, 8);
            bg.fill({ color: 0x444444 });
        });

        this.updateConfirmButton();
        this.container.visible = true;

        // Start timer
        this.updateTimer();
        this.timerInterval = setInterval(() => this.updateTimer(), 100);
    }

    private updateTimer(): void {
        const remaining = Math.max(0, this.deadlineMs - Date.now());
        const seconds = Math.ceil(remaining / 1000);
        if (this.timerText) {
            this.timerText.text = `${seconds}s`;
            this.timerText.style.fill = seconds <= 3 ? 0xff0000 : 0xff6b6b;
        }

        if (remaining <= 0) {
            this.hide();
        }
    }

    public hide(): void {
        this.container.visible = false;
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    public resize(width: number, height: number): void {
        // Update backdrop size
        const backdrop = this.container.getChildAt(0) as Graphics;
        backdrop.clear();
        backdrop.rect(0, 0, width, height);
        backdrop.fill({ color: 0x000000, alpha: 0.7 });

        // Center modal
        const modal = this.container.getChildAt(1) as Container;
        modal.x = width / 2;
        modal.y = height / 2;
    }
}
