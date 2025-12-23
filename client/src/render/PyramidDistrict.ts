import { Container, Graphics, Ticker } from 'pixi.js';
import type { Seat, CardInfo, DistrictInfo } from '../state/MatchStore';
import { TurnStack } from './TurnStack';

// =============================================================================
// Color Palettes by Faction
// =============================================================================

const FACTION_COLORS: Record<Seat, { base: number; light: number; dark: number }> = {
    LEFT: { base: 0xE53935, light: 0xEF9A9A, dark: 0xB71C1C },
    RIGHT: { base: 0x1E88E5, light: 0x90CAF9, dark: 0x0D47A1 },
    INDEP: { base: 0xFDD835, light: 0xFFF59D, dark: 0xF57F17 },
};

// ... lines 11-20 unchanged ...

// =============================================================================
// PyramidDistrict Component
// =============================================================================

export class PyramidDistrict extends Container {
    public districtIndex: number;
    private size: number;

    // Graphics layers
    private facesGraphics: Graphics;
    private edgesGraphics: Graphics;
    private claimOverlay: Graphics;
    private dropHighlightGraphics: Graphics;

    // Slot containers by seat -> array of 3
    public faceSlots: Record<Seat, Container[]> = {
        LEFT: [],
        RIGHT: [],
        INDEP: [],
    };

    // Turn Stacks attached to pyramid
    public turnStacks: Record<Seat, TurnStack> | null = null;

    // State
    private claimedBy: Seat | null = null;
    private claimAnimProgress: number = 0;
    private dropHighlightActive: boolean = false;
    private dropHighlightPhase: number = 0;

    // Idle micro-motion state
    private idlePhase: number = 0;
    private punchScale: number = 1.0;
    private isContested: boolean = false;
    private contestedPhase: number = 0;
    private centerDot: Graphics;
    private flashGraphics: Graphics;
    private flashAlpha: number = 0;
    private idleTickerCallback: ((ticker: Ticker) => void) | null = null;

    // Label
    // labelText removed

    // Vertices (computed once)
    private apex = { x: 0, y: 0 };
    private vertices: { x: number; y: number }[] = [];

    constructor(districtIndex: number, size: number = 140) {
        super();
        this.districtIndex = districtIndex;
        this.size = size;

        // Calculate vertices for top-down tetrahedron view
        // Apex is at center, 3 outer vertices form equilateral triangle
        this.apex = { x: 0, y: 0 };
        const r = size;
        // 3 outer vertices at 120° apart, starting from top
        this.vertices = [
            { x: 0, y: -r },                        // Top (between LEFT and RIGHT)
            { x: r * 0.866, y: r * 0.5 },           // Bottom-Right (between RIGHT and INDEP)
            { x: -r * 0.866, y: r * 0.5 },          // Bottom-Left (between LEFT and INDEP)
        ];

        // Create graphics layers (order matters for z-index)
        this.facesGraphics = new Graphics();
        this.flashGraphics = new Graphics();
        this.flashGraphics.alpha = 0;
        this.edgesGraphics = new Graphics();
        this.claimOverlay = new Graphics();
        this.claimOverlay.alpha = 0;
        this.dropHighlightGraphics = new Graphics();
        this.dropHighlightGraphics.alpha = 0;

        // Center dot for pulse effect
        this.centerDot = new Graphics();
        this.centerDot.circle(0, 0, 4);
        this.centerDot.fill({ color: 0xffffff, alpha: 0.4 });

        this.addChild(this.facesGraphics);
        this.addChild(this.flashGraphics);
        this.addChild(this.claimOverlay);
        this.addChild(this.dropHighlightGraphics);
        this.addChild(this.edgesGraphics);
        this.addChild(this.centerDot);

        // District label removed per user request

        // Initialize slots
        this.initSlots();
        this.initTurnStacks(); // Attach turn stacks

        // Draw initial state
        this.draw();

        // Start idle micro-motion ticker
        this.startIdleAnimation();
    }

    private startIdleAnimation(): void {
        // Random phase offset so pyramids don't all breathe in sync
        this.idlePhase = Math.random() * Math.PI * 2;

        this.idleTickerCallback = () => {
            this.updateIdleAnimation();
        };
        Ticker.shared.add(this.idleTickerCallback);
    }

    private updateIdleAnimation(): void {
        this.idlePhase += 0.03;

        // Breathing scale: more noticeable ~3-4px at size 140
        const breathScale = 1 + Math.sin(this.idlePhase * 0.5) * 0.015;

        // Slow rotation: ~±1° for subtle organic feel
        const idleRotation = Math.sin(this.idlePhase * 0.15) * 0.02;

        // Apply punch scale on top of breath (slower decay for more visible punch)
        this.punchScale += (1.0 - this.punchScale) * 0.08;
        const totalScale = breathScale * this.punchScale;

        // Flash decay
        this.flashAlpha *= 0.85;
        if (this.flashAlpha < 0.01) this.flashAlpha = 0;
        this.flashGraphics.alpha = this.flashAlpha;

        // Contested jitter (more visible)
        let jitterX = 0, jitterY = 0;
        if (this.isContested) {
            this.contestedPhase += 0.4;
            jitterX = Math.sin(this.contestedPhase * 7) * 2;
            jitterY = Math.cos(this.contestedPhase * 5) * 1;
        }

        // Apply transforms to graphics layers (not whole container to preserve position)
        this.facesGraphics.scale.set(totalScale);
        this.facesGraphics.rotation = idleRotation;
        this.facesGraphics.x = jitterX;
        this.facesGraphics.y = jitterY;

        this.flashGraphics.scale.set(totalScale);
        this.flashGraphics.rotation = idleRotation;
        this.flashGraphics.x = jitterX;
        this.flashGraphics.y = jitterY;

        this.edgesGraphics.scale.set(totalScale);
        this.edgesGraphics.rotation = idleRotation;
        this.edgesGraphics.x = jitterX;
        this.edgesGraphics.y = jitterY;

        // Center dot pulse (more visible)
        const dotAlpha = 0.4 + Math.sin(this.idlePhase * 1.2) * 0.3;
        const dotScale = 1 + Math.sin(this.idlePhase * 1.5) * 0.25;
        this.centerDot.alpha = dotAlpha;
        this.centerDot.scale.set(dotScale);
    }

    // =========================================================================
    // Initialization
    // =========================================================================

    private initTurnStacks(): void {
        this.turnStacks = {
            LEFT: new TurnStack('LEFT'),
            RIGHT: new TurnStack('RIGHT'),
            INDEP: new TurnStack('INDEP'),
        };

        // Position stacks at the MIDPOINT of each pyramid edge, with uniform padding outward
        // Pyramid: apex at (0, -r), corners at (±0.866r, 0.5r), r ≈ 90
        // Edge midpoints: LEFT (-40, -22), RIGHT (40, -22), BOTTOM (0, 45)
        // Padding: ~30px outward from edge

        // LEFT: Midpoint + outward offset (left-up direction)
        this.turnStacks.LEFT.x = -90;
        this.turnStacks.LEFT.y = -45;
        this.turnStacks.LEFT.rotation = (2 * Math.PI) / 3; // 120 degrees

        // RIGHT: Midpoint + outward offset (right-up direction)  
        this.turnStacks.RIGHT.x = 90;
        this.turnStacks.RIGHT.y = -45;
        this.turnStacks.RIGHT.rotation = -(2 * Math.PI) / 3; // -120 degrees

        // INDEP: Midpoint + outward offset (down direction)
        this.turnStacks.INDEP.x = 0;
        this.turnStacks.INDEP.y = 95;
        this.turnStacks.INDEP.rotation = 0;

        // Add all to container, but start hidden
        Object.values(this.turnStacks).forEach(stack => {
            stack.visible = false;
            this.addChild(stack);
        });
    }

    public updateTurnStacks(activeSeat: Seat, districtInfo: DistrictInfo): void {
        if (!this.turnStacks) return;

        const seats: Seat[] = ['LEFT', 'RIGHT', 'INDEP'];

        // Check if district is claimed - if so, no active highlighting
        const isClaimed = districtInfo.claimed_by !== null;

        seats.forEach(seat => {
            const stack = this.turnStacks![seat];

            // Always ensure stack is part of scene.
            // Internal logic hides it if empty and inactive.
            stack.visible = true;

            // Get played cards for this seat in this district
            const cards = districtInfo.sides[seat].cards.filter(c => c !== null) as CardInfo[];

            // Check if this seat has any empty slots
            const hasEmptySlot = cards.length < 3;

            // Highlight active stack ONLY if:
            // 1. District is not claimed
            // 2. It's this seat's turn
            // 3. The seat has at least one empty slot
            const shouldHighlight = !isClaimed && seat === activeSeat && hasEmptySlot;
            stack.setActive(shouldHighlight);

            // Only update if count changed (optimization)
            if (stack.getCardCount() !== cards.length) {
                stack.setCards(cards);
            }
        });
    }

    private initSlots(): void {
        const seats: Seat[] = ['LEFT', 'RIGHT', 'INDEP'];

        for (const seat of seats) {
            for (let i = 0; i < 3; i++) {
                const slot = new Container();
                slot.label = `slot_${seat}_${i}`;

                // Debug marker (will be replaced by mini cards)
                // const marker = new Graphics();
                // marker.circle(0, 0, 6);
                // marker.fill({ color: 0x333333, alpha: 0.5 });
                // marker.stroke({ width: 1, color: 0x666666 });
                // slot.addChild(marker);

                this.faceSlots[seat].push(slot);
                this.addChild(slot);
            }
        }

        // Position slots
        this.positionSlots();
    }

    private positionSlots(): void {
        // Face mapping:
        // LEFT face: apex to vertices[0] to vertices[2] (top-left region)
        // RIGHT face: apex to vertices[0] to vertices[1] (top-right region)
        // INDEP face: apex to vertices[1] to vertices[2] (bottom region)

        // Slots positioned along the EDGE of each face (outer edge, not toward apex)
        // LEFT: edge from vertices[2] to vertices[0]
        // RIGHT: edge from vertices[0] to vertices[1]
        // INDEP: edge from vertices[1] to vertices[2]

        const [v0, v1, v2] = this.vertices;

        // LEFT face slots along edge v2 -> v0
        this.positionSlotsOnEdge('LEFT', v2, v0);

        // RIGHT face slots along edge v0 -> v1
        this.positionSlotsOnEdge('RIGHT', v0, v1);

        // INDEP face slots along edge v2 -> v1 (note: reversed for visual consistency)
        this.positionSlotsOnEdge('INDEP', v2, v1);
    }

    private positionSlotsOnEdge(
        seat: Seat,
        start: { x: number; y: number },
        end: { x: number; y: number }
    ): void {
        const slots = this.faceSlots[seat];
        // Position at 25%, 50%, 75% along the edge
        const tValues = [0.2, 0.5, 0.8];

        slots.forEach((slot, idx) => {
            const t = tValues[idx];
            slot.x = start.x + (end.x - start.x) * t;
            slot.y = start.y + (end.y - start.y) * t;
        });
    }

    // =========================================================================
    // Drawing
    // =========================================================================

    public draw(): void {
        this.drawFaces();
        this.drawFlashOverlay();
        this.drawEdges();
    }

    private drawFlashOverlay(): void {
        const g = this.flashGraphics;
        g.clear();

        const [v0, v1, v2] = this.vertices;
        const apex = this.apex;
        const cornerRadius = 12;

        const drawRoundedTriangle = (
            p1: { x: number; y: number },
            p2: { x: number; y: number },
            p3: { x: number; y: number }
        ) => {
            const r = cornerRadius;
            const offset = (from: { x: number; y: number }, to: { x: number; y: number }, dist: number) => {
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                return { x: from.x + (dx / len) * dist, y: from.y + (dy / len) * dist };
            };
            const p1_to_p2 = offset(p1, p2, r);
            const p1_to_p3 = offset(p1, p3, r);
            const p2_to_p1 = offset(p2, p1, r);
            const p2_to_p3 = offset(p2, p3, r);
            const p3_to_p1 = offset(p3, p1, r);
            const p3_to_p2 = offset(p3, p2, r);

            g.moveTo(p1_to_p2.x, p1_to_p2.y);
            g.quadraticCurveTo(p1.x, p1.y, p1_to_p3.x, p1_to_p3.y);
            g.lineTo(p3_to_p1.x, p3_to_p1.y);
            g.quadraticCurveTo(p3.x, p3.y, p3_to_p2.x, p3_to_p2.y);
            g.lineTo(p2_to_p3.x, p2_to_p3.y);
            g.quadraticCurveTo(p2.x, p2.y, p2_to_p1.x, p2_to_p1.y);
            g.closePath();
            g.fill({ color: 0xFFFFFF, alpha: 1.0 });
        };

        drawRoundedTriangle(apex, v2, v0);
        drawRoundedTriangle(apex, v0, v1);
        drawRoundedTriangle(apex, v1, v2);
    }

    private drawFaces(): void {
        const g = this.facesGraphics;
        g.clear();

        const [v0, v1, v2] = this.vertices;
        const apex = this.apex;
        const cornerRadius = 12; // Rounded corner radius

        // Helper to draw a rounded triangle with quadratic curves at corners
        const drawRoundedTriangle = (
            p1: { x: number; y: number },
            p2: { x: number; y: number },
            p3: { x: number; y: number },
            color: number,
            alpha: number
        ) => {
            const r = cornerRadius;

            // Calculate points offset from corners towards adjacent vertices
            const offset = (from: { x: number; y: number }, to: { x: number; y: number }, dist: number) => {
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                return {
                    x: from.x + (dx / len) * dist,
                    y: from.y + (dy / len) * dist
                };
            };

            // Points just before/after each vertex
            const p1_to_p2 = offset(p1, p2, r);
            const p1_to_p3 = offset(p1, p3, r);
            const p2_to_p1 = offset(p2, p1, r);
            const p2_to_p3 = offset(p2, p3, r);
            const p3_to_p1 = offset(p3, p1, r);
            const p3_to_p2 = offset(p3, p2, r);

            g.moveTo(p1_to_p2.x, p1_to_p2.y);
            g.quadraticCurveTo(p1.x, p1.y, p1_to_p3.x, p1_to_p3.y); // Rounded corner at p1
            g.lineTo(p3_to_p1.x, p3_to_p1.y);
            g.quadraticCurveTo(p3.x, p3.y, p3_to_p2.x, p3_to_p2.y); // Rounded corner at p3
            g.lineTo(p2_to_p3.x, p2_to_p3.y);
            g.quadraticCurveTo(p2.x, p2.y, p2_to_p1.x, p2_to_p1.y); // Rounded corner at p2
            g.closePath();
            g.fill({ color, alpha });
        };

        // Draw 3 triangular faces with faction colors
        // LEFT face (apex, v2, v0) - uses dark shade
        const leftColor = this.claimedBy
            ? FACTION_COLORS[this.claimedBy].dark
            : FACTION_COLORS.LEFT.light;
        drawRoundedTriangle(apex, v2, v0, leftColor, 0.9);

        // RIGHT face (apex, v0, v1) - uses base shade
        const rightColor = this.claimedBy
            ? FACTION_COLORS[this.claimedBy].base
            : FACTION_COLORS.RIGHT.base;
        drawRoundedTriangle(apex, v0, v1, rightColor, 0.9);

        // INDEP face (apex, v1, v2) - uses light shade
        const indepColor = this.claimedBy
            ? FACTION_COLORS[this.claimedBy].light
            : FACTION_COLORS.INDEP.base;
        drawRoundedTriangle(apex, v1, v2, indepColor, 0.9);
    }

    private drawEdges(): void {
        const g = this.edgesGraphics;
        g.clear();

        const [v0, v1, v2] = this.vertices;
        const apex = this.apex;
        const cornerRadius = 12;

        // Helper for offset calculation
        const offset = (from: { x: number; y: number }, to: { x: number; y: number }, dist: number) => {
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            return { x: from.x + (dx / len) * dist, y: from.y + (dy / len) * dist };
        };

        // Draw outer triangle edges with rounded corners
        const r = cornerRadius;
        const v0_to_v1 = offset(v0, v1, r);
        const v0_to_v2 = offset(v0, v2, r);
        const v1_to_v0 = offset(v1, v0, r);
        const v1_to_v2 = offset(v1, v2, r);
        const v2_to_v0 = offset(v2, v0, r);
        const v2_to_v1 = offset(v2, v1, r);

        g.moveTo(v0_to_v1.x, v0_to_v1.y);
        g.quadraticCurveTo(v0.x, v0.y, v0_to_v2.x, v0_to_v2.y);
        g.lineTo(v2_to_v0.x, v2_to_v0.y);
        g.quadraticCurveTo(v2.x, v2.y, v2_to_v1.x, v2_to_v1.y);
        g.lineTo(v1_to_v2.x, v1_to_v2.y);
        g.quadraticCurveTo(v1.x, v1.y, v1_to_v0.x, v1_to_v0.y);
        g.closePath();
        g.stroke({ width: 2, color: 0x333333, alpha: 0.9 });

        // Draw lines from apex to each vertex
        g.moveTo(apex.x, apex.y);
        g.lineTo(v0.x, v0.y);
        g.stroke({ width: 1.5, color: 0x444444, alpha: 0.6 });

        g.moveTo(apex.x, apex.y);
        g.lineTo(v1.x, v1.y);
        g.stroke({ width: 1.5, color: 0x444444, alpha: 0.6 });

        g.moveTo(apex.x, apex.y);
        g.lineTo(v2.x, v2.y);
        g.stroke({ width: 1.5, color: 0x444444, alpha: 0.6 });

        // Apex highlight
        g.circle(apex.x, apex.y, 4);
        g.fill({ color: 0xffffff, alpha: 0.8 });
    }

    // =========================================================================
    // State & Animation
    // =========================================================================

    public setClaimed(seat: Seat | null): void {
        if (seat === this.claimedBy) return;

        this.claimedBy = seat;

        if (seat) {
            // Start claim animation
            this.startClaimAnimation();
        } else {
            // Reset to default
            this.draw();
        }
    }

    private startClaimAnimation(): void {
        this.claimAnimProgress = 0;

        // Draw claim overlay
        this.claimOverlay.clear();
        const [v0, v1, v2] = this.vertices;

        // Full pyramid glow
        this.claimOverlay.moveTo(v0.x, v0.y);
        this.claimOverlay.lineTo(v1.x, v1.y);
        this.claimOverlay.lineTo(v2.x, v2.y);
        this.claimOverlay.closePath();

        if (this.claimedBy) {
            this.claimOverlay.fill({
                color: FACTION_COLORS[this.claimedBy].base,
                alpha: 1,
            });
        }

        // Animate via ticker
        const animate = (ticker: Ticker) => {
            this.claimAnimProgress += ticker.deltaTime * 0.02;

            if (this.claimAnimProgress >= 1) {
                this.claimAnimProgress = 1;
                this.claimOverlay.alpha = 0;
                this.draw(); // Final redraw with claimed colors
                Ticker.shared.remove(animate);
                return;
            }

            // Pulse effect
            const pulse = Math.sin(this.claimAnimProgress * Math.PI * 4) * 0.5 + 0.5;
            this.claimOverlay.alpha = pulse * 0.6;
        };

        Ticker.shared.add(animate);
    }

    public getClaimedBy(): Seat | null {
        return this.claimedBy;
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    public getFaceCenter(seat: Seat): { x: number; y: number } {
        const [v0, v1, v2] = this.vertices;
        const apex = this.apex;

        switch (seat) {
            case 'LEFT':
                return {
                    x: (apex.x + v0.x + v2.x) / 3,
                    y: (apex.y + v0.y + v2.y) / 3,
                };
            case 'RIGHT':
                return {
                    x: (apex.x + v0.x + v1.x) / 3,
                    y: (apex.y + v0.y + v1.y) / 3,
                };
            case 'INDEP':
                return {
                    x: (apex.x + v1.x + v2.x) / 3,
                    y: (apex.y + v1.y + v2.y) / 3,
                };
        }
    }

    public getPyramidSize(): number {
        return this.size;
    }

    public setInteractable(interactable: boolean): void {
        // Dim the pyramid when not interactable (95% brightness)
        this.facesGraphics.alpha = interactable ? 1 : 0.5;
        this.edgesGraphics.alpha = interactable ? 1 : 0.6;

        // Also update turn stacks visibility
        if (this.turnStacks) {
            Object.values(this.turnStacks).forEach(stack => {
                stack.alpha = interactable ? 1 : 0.7;
            });
        }
    }

    // =========================================================================
    // Drop Target Highlight (Flame Animation)
    // =========================================================================

    public setDropHighlight(active: boolean): void {
        if (active === this.dropHighlightActive) return;
        this.dropHighlightActive = active;

        if (active) {
            // Start flame animation
            this.dropHighlightPhase = 0;
            this.dropHighlightGraphics.alpha = 1;
            this.drawDropHighlight();

            // Animate via ticker
            const animate = () => {
                if (!this.dropHighlightActive) {
                    Ticker.shared.remove(animate);
                    return;
                }
                this.dropHighlightPhase += 0.15;
                this.drawDropHighlight();
            };
            Ticker.shared.add(animate);
        } else {
            // Stop animation and hide
            this.dropHighlightGraphics.alpha = 0;
            this.dropHighlightGraphics.clear();
        }
    }

    private drawDropHighlight(): void {
        const g = this.dropHighlightGraphics;
        g.clear();

        const [v0, v1, v2] = this.vertices;
        const pulse = Math.sin(this.dropHighlightPhase) * 0.3 + 0.7; // 0.4 to 1.0
        const flicker = Math.sin(this.dropHighlightPhase * 3) * 0.1 + 0.9; // Flicker effect

        // Outer glow (orange/red gradient effect)
        const glowSize = 8 + pulse * 6;

        // Draw multiple layers for flame effect
        for (let i = 3; i >= 0; i--) {
            const offset = i * 4 + glowSize;
            const alpha = (0.3 - i * 0.06) * flicker;
            const color = i === 0 ? 0xff6600 : (i === 1 ? 0xff4400 : 0xff2200);

            g.moveTo(v0.x, v0.y - offset);
            g.lineTo(v1.x + offset * 0.866, v1.y + offset * 0.5);
            g.lineTo(v2.x - offset * 0.866, v2.y + offset * 0.5);
            g.closePath();
            g.stroke({ width: 3 + i * 2, color, alpha });
        }

        // Inner bright edge
        g.moveTo(v0.x, v0.y);
        g.lineTo(v1.x, v1.y);
        g.lineTo(v2.x, v2.y);
        g.closePath();
        g.stroke({ width: 3, color: 0xffaa00, alpha: 0.8 * flicker });
    }

    // =========================================================================
    // Card Landing & Contested Animations
    // =========================================================================

    /**
     * Trigger a punch scale animation when a card lands on this pyramid
     */
    public playCardLandedPunch(): void {
        this.punchScale = 1.15;
        this.flashAlpha = 0.8;
    }

    /**
     * Set contested state for tension jitter animation
     */
    public setContested(contested: boolean): void {
        this.isContested = contested;
        if (!contested) {
            this.contestedPhase = 0;
            // Reset position
            this.facesGraphics.x = 0;
            this.facesGraphics.y = 0;
            this.edgesGraphics.x = 0;
            this.edgesGraphics.y = 0;
        }
    }

    /**
     * Cleanup ticker when destroyed
     */
    public override destroy(): void {
        if (this.idleTickerCallback) {
            Ticker.shared.remove(this.idleTickerCallback);
            this.idleTickerCallback = null;
        }
        super.destroy();
    }
}
