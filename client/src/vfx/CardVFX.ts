/**
 * CardVFX - Visual effects for cards
 * Per 08_animation_and_vfx_styleguide.md
 * 
 * Supports distinct profiles per Faction.
 */

import { Container, Graphics, Ticker } from 'pixi.js';

// =============================================================================
// VFX Colors & Config
// =============================================================================

const VFX_COLORS: Record<string, number> = {
    INSTITUTION: 0x4A90D9, // Blue
    BASE: 0x50C878,        // Green
    MEDIA: 0xFFD700,       // Yellow
    CAPITAL: 0xE74C3C,     // Red
    IDEOLOGY: 0x9B59B6,    // Purple
    LOGISTICS: 0x7F8C8D,   // Grey
    CRISIS: 0xFFFFFF,      // White
};

type VfxProfile = 'INSTITUTION' | 'BASE' | 'MEDIA' | 'CAPITAL' | 'IDEOLOGY' | 'LOGISTICS' | 'CRISIS';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    alpha: number;
    color: number;
}

// =============================================================================
// Intensity Mapping
// =============================================================================

function getIntensity(value: string): number {
    const map: Record<string, number> = {
        '2': 0.20, '3': 0.28, '4': 0.36, '5': 0.44,
        '6': 0.52, '7': 0.60, '8': 0.72, '9': 0.86,
        '10': 1.00, 'A': 1.00,
    };
    return map[value] || 0.5;
}

// =============================================================================
// CardVFX Class
// =============================================================================

export class CardVFX {
    private container: Container;
    private glowGraphics: Graphics;
    private particleGraphics: Graphics;

    private width: number;
    private height: number;
    private profile: VfxProfile;
    private color: number;
    private intensity: number;
    private baseAlpha: number;

    private particles: Particle[] = [];
    private phase = 0;
    private isHovered = false;
    private animating = false;

    constructor(
        parent: Container,
        width: number,
        height: number,
        assetColor?: string,
        assetValue?: string
    ) {
        this.width = width;
        this.height = height;
        this.profile = (assetColor as VfxProfile) || 'CRISIS';
        this.color = VFX_COLORS[this.profile] || VFX_COLORS.CRISIS;
        this.intensity = getIntensity(assetValue || '5');
        this.baseAlpha = 0.4 + this.intensity * 0.4;

        // Main VFX container (behind card content via zIndex or order)
        this.container = new Container();
        parent.addChildAt(this.container, 0);

        // Glow layer
        this.glowGraphics = new Graphics();
        this.container.addChild(this.glowGraphics);

        // Particle layer
        this.particleGraphics = new Graphics();
        this.container.addChild(this.particleGraphics);

        // Initial draw
        this.drawBaseGlow(this.baseAlpha);
    }

    /**
     * Called every frame by MatchScene ticker
     */
    update(ticker: Ticker): void {
        if (!this.animating) return;

        const delta = ticker.deltaTime;
        this.phase += 0.05 * delta * (1 + this.intensity);

        // 1. Update Profile-Specific Animation
        this.drawAnimatedGlow();

        // 2. Emit Particles
        this.emitParticles(delta);

        // 3. Update Particles
        this.updateParticles(delta);
    }

    private drawBaseGlow(alpha: number): void {
        this.glowGraphics.clear();
        const padding = 12;

        // Base backing (soft)
        this.glowGraphics.roundRect(-padding, -padding, this.width + padding * 2, this.height + padding * 2, 10);
        this.glowGraphics.fill({ color: this.color, alpha: alpha * 0.3 });

        // Border
        this.glowGraphics.roundRect(0, 0, this.width, this.height, 6);
        this.glowGraphics.stroke({ width: 2, color: this.color, alpha: alpha * 0.8 });
    }

    private drawAnimatedGlow(): void {
        const alpha = this.isHovered ? Math.min(1, this.baseAlpha + 0.2) : this.baseAlpha;
        const pulse = (Math.sin(this.phase) * 0.5 + 0.5); // 0 to 1

        this.glowGraphics.clear();

        // Common Base
        const padding = 12;
        this.glowGraphics.roundRect(-padding, -padding, this.width + padding * 2, this.height + padding * 2, 10);
        this.glowGraphics.fill({ color: this.color, alpha: alpha * 0.3 });

        switch (this.profile) {
            case 'INSTITUTION': // Scanning line
                this.glowGraphics.roundRect(0, 0, this.width, this.height, 6);
                this.glowGraphics.stroke({ width: 2, color: this.color, alpha: alpha });

                // Scan line
                const scanY = (this.phase * 50) % (this.height + 20) - 10;
                if (scanY > 0 && scanY < this.height) {
                    this.glowGraphics.rect(-5, scanY, this.width + 10, 2);
                    this.glowGraphics.fill({ color: 0xffffff, alpha: 0.6 });
                }
                break;

            case 'BASE': // Pulsing Nodes
                this.glowGraphics.roundRect(0, 0, this.width, this.height, 6);
                this.glowGraphics.stroke({ width: 2, color: this.color, alpha: alpha });

                // Corner nodes
                const nodeSize = 4 + pulse * 4;
                this.glowGraphics.circle(0, 0, nodeSize).fill(this.color); // TL
                this.glowGraphics.circle(this.width, 0, nodeSize).fill(this.color); // TR
                this.glowGraphics.circle(0, this.height, nodeSize).fill(this.color); // BL
                this.glowGraphics.circle(this.width, this.height, nodeSize).fill(this.color); // BR
                break;

            case 'MEDIA': // Expanding Ripples
                this.glowGraphics.roundRect(0, 0, this.width, this.height, 6);
                this.glowGraphics.stroke({ width: 2, color: this.color, alpha: alpha });

                const rippleSize = (this.phase * 10) % 20;
                const rippleAlpha = 1 - (rippleSize / 20);
                this.glowGraphics.roundRect(-rippleSize, -rippleSize, this.width + rippleSize * 2, this.height + rippleSize * 2, 8);
                this.glowGraphics.stroke({ width: 1, color: this.color, alpha: rippleAlpha * alpha });
                break;

            case 'CAPITAL': // Heavy Thump
                const thump = Math.sin(this.phase * 0.5); // Slow pulse
                const borderWidth = 2 + thump * 3;
                this.glowGraphics.roundRect(0, 0, this.width, this.height, 6);
                this.glowGraphics.stroke({ width: borderWidth, color: this.color, alpha: alpha });
                break;

            case 'LOGISTICS': // Moving packet
                this.glowGraphics.roundRect(0, 0, this.width, this.height, 6);
                this.glowGraphics.stroke({ width: 2, color: this.color, alpha: alpha });

                // Moving dot along perimeter approx
                const perimeter = (this.width + this.height) * 2;
                const dist = (this.phase * 100) % perimeter;
                let px = 0, py = 0;
                // Simple rectangular path logic
                if (dist < this.width) { px = dist; py = 0; }
                else if (dist < this.width + this.height) { px = this.width; py = dist - this.width; }
                else if (dist < this.width * 2 + this.height) { px = this.width - (dist - (this.width + this.height)); py = this.height; }
                else { px = 0; py = this.height - (dist - (this.width * 2 + this.height)); }

                this.glowGraphics.circle(px, py, 4).fill({ color: 0xffffff });
                break;

            default: // Ideology, Crisis, etc. (Generic Pulse)
                this.glowGraphics.roundRect(-2, -2, this.width + 4, this.height + 4, 8);
                this.glowGraphics.stroke({ width: 2 + pulse * 2, color: this.color, alpha: alpha });
                this.glowGraphics.roundRect(0, 0, this.width, this.height, 6);
                this.glowGraphics.stroke({ width: 2, color: this.color, alpha: alpha });
                break;
        }
    }

    private emitParticles(delta: number): void {
        // Emission rate based on intensity & hover
        const rate = (this.isHovered ? 0.5 : 0.05) * this.intensity * delta;
        if (Math.random() < rate) {
            // Spawn particle
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: -Math.random() * 1.0 - 0.2, // Upward drift default
                life: 60,
                maxLife: 60,
                size: 2 + Math.random() * 2,
                alpha: 1,
                color: this.color
            });
        }
    }

    private updateParticles(delta: number): void {
        this.particleGraphics.clear();

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= delta;
            p.x += p.vx * delta;
            p.y += p.vy * delta;
            p.alpha = p.life / p.maxLife;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            // Render
            if (this.profile === 'INSTITUTION') {
                this.particleGraphics.rect(p.x, p.y, p.size, p.size).fill({ color: p.color, alpha: p.alpha });
            } else {
                this.particleGraphics.circle(p.x, p.y, p.size / 2).fill({ color: p.color, alpha: p.alpha });
            }
        }
    }

    // =========================================================================
    // Public Controls
    // =========================================================================

    startIdle(): void {
        this.animating = true;
    }

    stopIdle(): void {
        this.animating = false;
        this.glowGraphics.clear();
        this.particleGraphics.clear();
    }

    hover(): void {
        this.isHovered = true;
    }

    unhover(): void {
        this.isHovered = false;
    }

    playBurst(): void {
        // Add burst particles
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: this.width / 2,
                y: this.height / 2,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 40,
                maxLife: 40,
                size: 3,
                alpha: 1,
                color: 0xffffff
            });
        }
    }

    destroy(): void {
        this.container.destroy({ children: true });
    }
}

export function createCardVFX(
    parent: Container,
    width: number,
    height: number,
    assetColor?: string,
    assetValue?: string
): CardVFX {
    return new CardVFX(parent, width, height, assetColor, assetValue);
}
