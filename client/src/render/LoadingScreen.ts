/**
 * LoadingScreen - Full screen asset loading indicator
 */

import { Container, Graphics, Text, Ticker } from 'pixi.js';
import { COLORS } from '../main';

// =============================================================================
// Constants
// =============================================================================

const BAR_WIDTH = 400;
const BAR_HEIGHT = 6;
const BAR_RADIUS = 3;

// =============================================================================
// LoadingScreen
// =============================================================================

export class LoadingScreen extends Container {
    private bg: Graphics;
    private logoText: Text;
    private progressBarBg: Graphics;
    private progressBarFill: Graphics;
    private loadingText: Text;
    private tickerCallback: ((ticker: Ticker) => void) | null = null;
    private progress: number = 0;
    private targetProgress: number = 0;
    private pulsePhase: number = 0;

    constructor(width: number, height: number) {
        super();

        // 1. Background
        this.bg = new Graphics();
        this.bg.rect(0, 0, width, height);
        this.bg.fill({ color: COLORS.BACKGROUND });
        this.addChild(this.bg);

        // 2. Logo Text "MANDATE"
        this.logoText = new Text({
            text: 'MANDATE',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 64,
                fontWeight: '900',
                fill: 0xffffff,
                letterSpacing: 8,
            },
        });
        this.logoText.anchor.set(0.5);
        this.logoText.x = width / 2;
        this.logoText.y = height / 2 - 40;
        this.addChild(this.logoText);

        // 3. Progress Bar Background
        this.progressBarBg = new Graphics();
        this.progressBarBg.rect(0, 0, BAR_WIDTH, BAR_HEIGHT); // No roundRect for sleek look? actually radius is nicer
        this.progressBarBg.roundRect(0, 0, BAR_WIDTH, BAR_HEIGHT, BAR_RADIUS);
        this.progressBarBg.fill({ color: 0x333333 });
        this.progressBarBg.pivot.set(BAR_WIDTH / 2, BAR_HEIGHT / 2);
        this.progressBarBg.x = width / 2;
        this.progressBarBg.y = height / 2 + 40;
        this.addChild(this.progressBarBg);

        // 4. Progress Bar Fill
        this.progressBarFill = new Graphics();
        // Initial drawing (0 width)
        this.drawProgress(0);
        this.progressBarFill.x = width / 2 - BAR_WIDTH / 2;
        this.progressBarFill.y = height / 2 + 40 - BAR_HEIGHT / 2;
        this.addChild(this.progressBarFill);

        // 5. Loading Text
        this.loadingText = new Text({
            text: 'INITIALIZING CAUSALITY...',
            style: {
                fontFamily: 'Mono, monospace', // Techy feel
                fontSize: 12,
                fill: 0x666666,
                letterSpacing: 2,
            },
        });
        this.loadingText.anchor.set(0.5);
        this.loadingText.x = width / 2;
        this.loadingText.y = height / 2 + 65;
        this.addChild(this.loadingText);

        // Start animation loop
        this.tickerCallback = () => this.update();
        Ticker.shared.add(this.tickerCallback);
    }

    private drawProgress(pct: number): void {
        this.progressBarFill.clear();
        if (pct <= 0) return;

        const w = Math.max(BAR_RADIUS * 2, BAR_WIDTH * pct);
        this.progressBarFill.roundRect(0, 0, w, BAR_HEIGHT, BAR_RADIUS);
        this.progressBarFill.fill({ color: COLORS.MEDIA }); // Gold/Yellow color for progress
    }

    public updateProgress(progress: number): void {
        this.targetProgress = Math.min(1, Math.max(0, progress));
    }

    private update(): void {
        // Smooth progress interpolation
        this.progress += (this.targetProgress - this.progress) * 0.1;

        // Snap to finish
        if (Math.abs(this.targetProgress - this.progress) < 0.005) {
            this.progress = this.targetProgress;
        }

        this.drawProgress(this.progress);

        // Update text percentage
        const pct = Math.floor(this.progress * 100);
        this.loadingText.text = `ESTABLISHING NEURAL LINK... ${pct}%`;

        // Pulse logo opacity
        this.pulsePhase += 0.05;
        this.logoText.alpha = 0.8 + Math.sin(this.pulsePhase) * 0.2;
    }

    public onResize(width: number, height: number): void {
        this.bg.clear();
        this.bg.rect(0, 0, width, height);
        this.bg.fill({ color: COLORS.BACKGROUND });

        this.logoText.x = width / 2;
        this.logoText.y = height / 2 - 40;

        this.progressBarBg.x = width / 2;
        this.progressBarBg.y = height / 2 + 40;

        this.progressBarFill.x = width / 2 - BAR_WIDTH / 2;
        this.progressBarFill.y = height / 2 + 40 - BAR_HEIGHT / 2;

        this.loadingText.x = width / 2;
        this.loadingText.y = height / 2 + 65;
    }

    public destroy(): void {
        if (this.tickerCallback) {
            Ticker.shared.remove(this.tickerCallback);
        }
        super.destroy();
    }
}
