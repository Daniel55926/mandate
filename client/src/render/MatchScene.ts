/**
 * MatchScene - Game board with 7 districts, hand fan, and drag & drop
 */

import { Container, Text, Graphics, Application, FederatedPointerEvent, Sprite, Ticker, Rectangle } from 'pixi.js';
import { COLORS } from '../main';
import { WsClient } from '../net/WsClient';
import { matchStore, type MatchState, type CardInfo, type Seat } from '../state/MatchStore';
import { CrisisModal } from './CrisisModal';
import { createCardVFX, type CardVFX } from '../vfx/CardVFX';
import { AudioManager } from '../audio/AudioManager';
import { AssetLoader } from '../assets/AssetLoader';
import { PyramidDistrict } from './PyramidDistrict';
import { TurnStack } from './TurnStack';
import { PlayerHUD } from './PlayerHUD';
import { HandStrengthsDrawer } from './HandStrengthsDrawer';
import { OpponentHand } from './OpponentHand';
import { GameHistoryDrawer } from './GameHistoryDrawer';
import { TurnSnackbar } from './TurnSnackbar';

// =============================================================================
// Constants
// =============================================================================

// Constants
const CARD_WIDTH = 70;
const CARD_HEIGHT = 100;


// =============================================================================
// MatchScene
// =============================================================================

export class MatchScene {
    public readonly container: Container;

    private wsClient: WsClient;
    private state: MatchState | null = null;

    // Containers
    private boardContainer: Container;
    private handContainer: Container;
    private infoContainer: Container;
    private dragContainer: Container;
    private popupOverlay: Container;
    private crisisModal: CrisisModal;

    // Cards
    private cardSprites: Map<string, Container> = new Map();
    private cardVFXMap: Map<string, CardVFX> = new Map();
    private pyramidDistricts: PyramidDistrict[] = [];

    // Player HUD
    private playerHUD: PlayerHUD;

    // Reference drawer
    private handStrengthsDrawer: HandStrengthsDrawer;

    // Opponent hands (Hearthstone-style side displays)
    private opponentHandLeft: OpponentHand | null = null;
    private opponentHandRight: OpponentHand | null = null;

    // Game history drawer (left side)
    private gameHistoryDrawer: GameHistoryDrawer;

    // Turn indicator snackbar
    private turnSnackbar: TurnSnackbar;

    // Drag state
    private draggedCard: Container | null = null;
    private draggedCardId: string | null = null;
    private highlightedPyramidIndex: number = -1;

    // Drag physics state
    private dragTargetX: number = 0;
    private dragTargetY: number = 0;
    private dragPhysicsTicker: ((ticker: Ticker) => void) | null = null;
    private dragVelocityX: number = 0;
    private dragVelocityY: number = 0;
    private dragShadow: Graphics | null = null;
    private dragGhostPreview: Container | null = null;

    private app: Application;

    constructor(app: Application, wsClient: WsClient) {
        this.app = app;
        this.wsClient = wsClient;
        this.container = new Container();

        // Create layers
        this.boardContainer = new Container();
        this.handContainer = new Container();
        this.infoContainer = new Container();
        this.dragContainer = new Container();
        this.popupOverlay = new Container();

        this.container.addChild(this.boardContainer);
        this.container.addChild(this.handContainer);
        this.container.addChild(this.infoContainer);
        this.container.addChild(this.dragContainer);
        this.container.addChild(this.popupOverlay);

        // Set up stage for global pointer tracking (fixes drag issues when moving fast)
        this.app.stage.eventMode = 'static';
        this.app.stage.hitArea = new Rectangle(0, 0, 10000, 10000);

        // Set popup layer for TurnStack hover popups
        TurnStack.popupLayer = this.popupOverlay;

        // Player HUD (top of screen)
        this.playerHUD = new PlayerHUD();
        this.infoContainer.addChild(this.playerHUD);

        // Hand strengths reference drawer (right side)
        this.handStrengthsDrawer = new HandStrengthsDrawer();
        this.container.addChild(this.handStrengthsDrawer);

        // Game history drawer (left side)
        this.gameHistoryDrawer = new GameHistoryDrawer();
        this.container.addChild(this.gameHistoryDrawer);

        // Turn indicator snackbar (bottom center)
        this.turnSnackbar = new TurnSnackbar();
        this.container.addChild(this.turnSnackbar);

        // Crisis modal (always on top)
        this.crisisModal = new CrisisModal(wsClient);
        this.container.addChild(this.crisisModal.container);

        this.createBoard();
        this.createInfoDisplay();

        // VFX Update Loop
        this.app.ticker.add((ticker) => {
            this.cardVFXMap.forEach((vfx) => {
                vfx.update(ticker);
            });
        });

        // Load assets then subscribe
        this.loadAssets().then(() => {
            // Subscribe to match store
            matchStore.subscribe((state) => {
                this.state = state;
                this.updateUI();
            });

            // Connect history events to game log drawer
            matchStore.onHistoryEvent = (type, data) => {
                const eventData = data as { turn?: number; seat?: Seat; card?: CardInfo; districtIndex?: number; winner?: Seat };

                if (type === 'CARD_PLAYED' && eventData.card) {
                    this.gameHistoryDrawer.addCardPlayed(
                        eventData.turn || 0,
                        eventData.seat as Seat,
                        eventData.card,
                        eventData.districtIndex || 0
                    );

                    // Trigger punch animation on target pyramid
                    const pyramid = this.pyramidDistricts[eventData.districtIndex || 0];
                    if (pyramid) {
                        pyramid.playCardLandedPunch();
                    }
                } else if (type === 'DISTRICT_CLAIMED') {
                    this.gameHistoryDrawer.addDistrictClaimed(
                        eventData.turn || 0,
                        eventData.winner as Seat,
                        eventData.districtIndex || 0,
                        eventData.winner as Seat
                    );
                }
            };
        });

        // Ensure shared ticker is running for TurnStack animations
        Ticker.shared.autoStart = true;
        if (!Ticker.shared.started) Ticker.shared.start();
    }

    // ===========================================================================
    // Board Setup
    // ===========================================================================

    private createBoard(): void {
        // Create 7 pyramid districts
        for (let i = 0; i < 7; i++) {
            const pyramid = new PyramidDistrict(i, 100);
            this.pyramidDistricts.push(pyramid);
            this.boardContainer.addChild(pyramid);
        }
    }

    // Old createDistrictContainer removed


    private createInfoDisplay(): void {
        // Info display handled by PlayerHUD
    }

    // ===========================================================================
    // Asset Loading
    // ===========================================================================

    private async loadAssets(): Promise<void> {
        // Load card catalog and textures
        await AssetLoader.loadCatalog();
        await AssetLoader.preloadTextures();
        console.log('[MatchScene] Assets loaded');
    }

    // ===========================================================================
    // Hand Management
    // ===========================================================================

    private updateHand(): void {
        // Clear existing hand
        this.handContainer.removeChildren();
        this.cardSprites.clear();

        if (!this.state || !this.state.hand.length) return;

        const hand = this.state.hand;
        const cardSpacing = Math.min(80, 600 / hand.length);
        const startX = -(hand.length - 1) * cardSpacing / 2;

        hand.forEach((card, idx) => {
            const cardContainer = this.createCardSprite(card);
            cardContainer.x = startX + idx * cardSpacing;
            cardContainer.y = 0;
            cardContainer.rotation = (idx - (hand.length - 1) / 2) * 0.05; // Fan effect

            // Make always draggable (for sorting), play validation happens on drop
            cardContainer.eventMode = 'static';
            cardContainer.cursor = 'grab';
            cardContainer.on('pointerdown', (e) => this.onDragStart(e, card, cardContainer));

            this.handContainer.addChild(cardContainer);
            this.cardSprites.set(card.card_instance_id, cardContainer);
        });
    }

    private createCardSprite(card: CardInfo): Container {
        const container = new Container();
        container.label = card.card_instance_id;

        // Build card_def_id from card info
        const cardDefId = card.kind === 'CRISIS'
            ? `crisis.${card.card_def_id?.split('.')[1] || '1'}`
            : `asset.${card.asset_color?.toLowerCase()}.${card.asset_value}`;

        // Try to get actual texture
        const texture = AssetLoader.getCardTexture(cardDefId);

        container.sortableChildren = true;

        if (texture) {
            // Use actual card image
            const sprite = new Sprite(texture);
            sprite.width = CARD_WIDTH;
            sprite.height = CARD_HEIGHT;
            sprite.zIndex = 1;
            container.addChild(sprite);
        } else {
            // Fallback: colored rectangle with value
            const bg = new Graphics();
            bg.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 6);
            bg.zIndex = 1;

            const colorMap: Record<string, number> = {
                INSTITUTION: COLORS.INSTITUTION,
                BASE: COLORS.BASE,
                MEDIA: COLORS.MEDIA,
                CAPITAL: COLORS.CAPITAL,
                IDEOLOGY: COLORS.IDEOLOGY,
                LOGISTICS: COLORS.DIVIDER,
            };

            const cardColor = card.kind === 'CRISIS'
                ? 0x444444
                : (colorMap[card.asset_color || ''] || 0x888888);

            bg.fill({ color: cardColor });
            container.addChild(bg);

            // Value text
            const valueText = new Text({
                text: card.kind === 'CRISIS' ? '?' : (card.asset_value || ''),
                style: {
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 28,
                    fill: 0xffffff,
                    fontWeight: 'bold',
                },
            });
            valueText.anchor.set(0.5);
            valueText.x = CARD_WIDTH / 2;
            valueText.y = CARD_HEIGHT / 2;
            valueText.zIndex = 2;
            container.addChild(valueText);

            // Color indicator
            if (card.kind === 'ASSET' && card.asset_color) {
                const colorLabel = new Text({
                    text: card.asset_color.charAt(0),
                    style: {
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 12,
                        fill: 0xffffff,
                    },
                });
                colorLabel.x = 5;
                colorLabel.y = 5;
                colorLabel.zIndex = 2;
                container.addChild(colorLabel);
            }
        }

        container.pivot.set(CARD_WIDTH / 2, CARD_HEIGHT / 2);

        // Add VFX (idle glow) for hand cards
        const vfx = createCardVFX(
            container,
            CARD_WIDTH,
            CARD_HEIGHT,
            card.asset_color,
            card.asset_value
        );
        vfx.startIdle();
        this.cardVFXMap.set(card.card_instance_id, vfx);

        // Hover listeners
        container.eventMode = 'static';
        container.on('pointerenter', () => this.onPointerOver(card.card_instance_id));
        container.on('pointerleave', () => this.onPointerOut(card.card_instance_id));

        return container;
    }

    // ===========================================================================
    // Drag & Drop
    // ===========================================================================

    private onDragStart(_e: FederatedPointerEvent, card: CardInfo, container: Container): void {
        // Allow dragging anytime (for sorting), but only allow playing during your turn

        // Play pickup sound
        AudioManager.playCardPickup();

        this.draggedCard = container;
        this.draggedCardId = card.card_instance_id;

        // Move to drag layer
        const globalPos = container.getGlobalPosition();
        this.handContainer.removeChild(container);
        this.dragContainer.addChild(container);
        container.x = globalPos.x;
        container.y = globalPos.y;
        container.cursor = 'grabbing';

        // Lift effect: scale up slightly when picked up
        container.scale.set(1.08);
        container.alpha = 1;

        // Create shadow for lift effect
        this.dragShadow = new Graphics();
        this.dragShadow.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 8);
        this.dragShadow.fill({ color: 0x000000, alpha: 0.3 });
        this.dragShadow.x = globalPos.x + 5;
        this.dragShadow.y = globalPos.y + 8;
        this.dragShadow.scale.set(1.08);
        this.dragContainer.addChildAt(this.dragShadow, 0);

        // Initialize for smooth follow
        this.dragTargetX = globalPos.x;
        this.dragTargetY = globalPos.y;
        this.dragVelocityX = 0;
        this.dragVelocityY = 0;

        // Enhanced physics ticker with spring follow, velocity tilt, and shadow
        this.dragPhysicsTicker = () => {
            if (!this.draggedCard) return;

            // Calculate velocity (difference before smoothing)
            const prevX = this.draggedCard.x;
            const prevY = this.draggedCard.y;

            // Spring-based smooth interpolation (springy follow)
            const springStrength = 0.18; // Lower = more lag/spring
            const dx = this.dragTargetX - this.draggedCard.x;
            const dy = this.dragTargetY - this.draggedCard.y;

            this.draggedCard.x += dx * springStrength;
            this.draggedCard.y += dy * springStrength;

            // Track velocity with smoothing
            const velocitySmooth = 0.3;
            this.dragVelocityX = this.dragVelocityX * (1 - velocitySmooth) + (this.draggedCard.x - prevX) * velocitySmooth;
            this.dragVelocityY = this.dragVelocityY * (1 - velocitySmooth) + (this.draggedCard.y - prevY) * velocitySmooth;

            // Velocity-based tilt (rotate card based on horizontal movement)
            const maxTilt = 0.25; // ~15 degrees max
            const tiltAmount = Math.max(-maxTilt, Math.min(maxTilt, this.dragVelocityX * 0.03));
            this.draggedCard.rotation = tiltAmount;

            // Subtle skew based on velocity direction (card bending)
            this.draggedCard.skew.x = this.dragVelocityX * 0.005;
            this.draggedCard.skew.y = this.dragVelocityY * 0.003;

            // Update shadow position and size (grows as card lifts/moves fast)
            if (this.dragShadow) {
                const speed = Math.sqrt(this.dragVelocityX ** 2 + this.dragVelocityY ** 2);
                const shadowOffset = 8 + speed * 0.5;
                const shadowScale = 1.08 + speed * 0.01;
                const shadowAlpha = Math.min(0.35, 0.25 + speed * 0.02);

                this.dragShadow.x = this.draggedCard.x + shadowOffset * 0.5;
                this.dragShadow.y = this.draggedCard.y + shadowOffset;
                this.dragShadow.alpha = shadowAlpha;
                this.dragShadow.scale.set(shadowScale);
                this.dragShadow.rotation = tiltAmount * 0.5;
            }
        };

        Ticker.shared.add(this.dragPhysicsTicker);

        // Set up global pointer tracking
        const stage = this.app.stage;
        stage.eventMode = 'static';
        stage.on('pointermove', this.onDragMove, this);
        stage.on('pointerup', this.onDragEnd, this);
        stage.on('pointerupoutside', this.onDragEnd, this);
    }

    private onDragMove = (e: FederatedPointerEvent): void => {
        if (!this.draggedCard) return;

        // Update TARGET position (physics ticker will smoothly follow)
        this.dragTargetX = e.globalX;
        this.dragTargetY = e.globalY;

        // Check for valid drop target and highlight
        if (this.state?.isMyTurn) {
            const dropResult = this.findDropTarget({ x: e.globalX, y: e.globalY });
            const newHighlight = dropResult ? dropResult.districtIndex : -1;

            if (newHighlight !== this.highlightedPyramidIndex) {
                // Clear previous highlight
                if (this.highlightedPyramidIndex >= 0) {
                    this.pyramidDistricts[this.highlightedPyramidIndex].setDropHighlight(false);
                }

                // Clear ghost preview when leaving a pyramid
                if (this.dragGhostPreview) {
                    this.dragContainer.removeChild(this.dragGhostPreview);
                    this.dragGhostPreview.destroy();
                    this.dragGhostPreview = null;
                }

                // Set new highlight and create ghost preview
                if (newHighlight >= 0) {
                    this.pyramidDistricts[newHighlight].setDropHighlight(true);

                    // Create ghost preview at target pyramid
                    if (this.draggedCard && dropResult) {
                        const pyramid = this.pyramidDistricts[newHighlight];
                        const mySeat = this.state?.mySeat;
                        if (mySeat) {
                            // Get the face center where card would snap
                            const faceCenter = pyramid.getFaceCenter(mySeat);
                            const pyramidGlobal = pyramid.getGlobalPosition();

                            // Create ghost preview (semi-transparent small card)
                            this.dragGhostPreview = new Container();
                            const ghost = new Graphics();
                            ghost.roundRect(-20, -28, 40, 56, 4);
                            ghost.fill({ color: 0xffffff, alpha: 0.3 });
                            ghost.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
                            this.dragGhostPreview.addChild(ghost);

                            // Position at face center
                            this.dragGhostPreview.x = pyramidGlobal.x + faceCenter.x;
                            this.dragGhostPreview.y = pyramidGlobal.y + faceCenter.y;
                            this.dragContainer.addChild(this.dragGhostPreview);
                        }
                    }
                }
                this.highlightedPyramidIndex = newHighlight;
            }
        }
    };

    private onDragEnd = (e: FederatedPointerEvent): void => {
        if (!this.draggedCard || !this.draggedCardId) return;

        // Stop physics simulation
        if (this.dragPhysicsTicker) {
            Ticker.shared.remove(this.dragPhysicsTicker);
            this.dragPhysicsTicker = null;
        }

        // Save card ID and clear drag state FIRST
        const cardId = this.draggedCardId;
        const cardContainer = this.draggedCard;

        // Reset visual state before clearing reference
        cardContainer.rotation = 0;
        cardContainer.scale.set(1);
        cardContainer.skew.set(0, 0); // Reset skew

        // Clean up shadow
        if (this.dragShadow) {
            this.dragContainer.removeChild(this.dragShadow);
            this.dragShadow.destroy();
            this.dragShadow = null;
        }

        // Clean up ghost preview
        if (this.dragGhostPreview) {
            this.dragContainer.removeChild(this.dragGhostPreview);
            this.dragGhostPreview.destroy();
            this.dragGhostPreview = null;
        }

        this.draggedCard = null;
        this.draggedCardId = null;

        // Remove event listeners
        const stage = this.app.stage;
        stage.off('pointermove', this.onDragMove, this);
        stage.off('pointerup', this.onDragEnd, this);
        stage.off('pointerupoutside', this.onDragEnd, this);

        // Clean up visual
        this.dragContainer.removeChild(cardContainer);

        // Clear any drop highlight
        if (this.highlightedPyramidIndex >= 0) {
            this.pyramidDistricts[this.highlightedPyramidIndex].setDropHighlight(false);
            this.highlightedPyramidIndex = -1;
        }

        // Check drop
        const globalPos = { x: e.globalX, y: e.globalY };
        const dropResult = this.findDropTarget(globalPos);

        let success = false;
        if (dropResult && this.state?.mySeat === dropResult.seat && this.state?.isMyTurn) {
            console.log(`[MatchScene] Playing card to D${dropResult.districtIndex} slot ${dropResult.slotIndex}`);

            this.wsClient.sendIntent('PLAY_CARD', {
                card_instance_id: cardId,
                district_id: `D${dropResult.districtIndex}`,
                slot_index: dropResult.slotIndex,
            }, {
                onRejected: (reason, details) => {
                    console.error(`[MatchScene] Play rejected: ${reason} - ${details}`);
                    AudioManager.playCardDropInvalid();
                    this.updateHand();
                }
            });

            AudioManager.playCardDrop();
            const vfx = this.cardVFXMap.get(cardId);
            if (vfx) vfx.playBurst();
            success = true;
        }

        if (!success) {
            // When not playing a card, try to reorder hand based on drop position
            const handCards = this.state?.hand || [];
            if (handCards.length > 1) {
                // Calculate which position in hand based on X coordinate
                const handCenterX = this.handContainer.x;
                const cardSpacing = 80; // Approximate spacing between cards
                const handWidth = (handCards.length - 1) * cardSpacing;
                const startX = handCenterX - handWidth / 2;

                // Find new index based on drop X
                const relativeX = e.globalX - startX;
                let newIndex = Math.round(relativeX / cardSpacing);
                newIndex = Math.max(0, Math.min(newIndex, handCards.length - 1));

                // Reorder in store
                matchStore.reorderHand(cardId, newIndex);
            }
            // Small audio feedback for sorting (softer than invalid)
        }

        // Update hand to restore card state
        this.updateHand();
    };

    private findDropTarget(globalPos: { x: number; y: number }): {
        districtIndex: number;
        seat: Seat;
        slotIndex: number;
    } | null {
        const mySeat = this.state?.mySeat;
        if (!mySeat) return null;

        // Check each pyramid - if drop is anywhere within pyramid bounds, 
        // automatically find the first empty slot for the player's seat
        for (let dIdx = 0; dIdx < this.pyramidDistricts.length; dIdx++) {
            const pyramid = this.pyramidDistricts[dIdx];
            const prismGlobal = pyramid.getGlobalPosition();

            // Distance check to pyramid center (radius ~120, scaled by 0.8 = ~100)
            const distPrism = Math.hypot(globalPos.x - prismGlobal.x, globalPos.y - prismGlobal.y);

            if (distPrism < 120) {
                // Dropped on this pyramid - check if claimed first
                const distInfo = this.state?.round?.districts[dIdx];
                if (distInfo) {
                    // Don't allow drops on claimed districts
                    if (distInfo.claimed_by !== null) {
                        continue;
                    }

                    const mySlots = distInfo.sides[mySeat].cards;
                    const firstEmpty = mySlots.findIndex(c => c === null);
                    if (firstEmpty !== -1) {
                        return { districtIndex: dIdx, seat: mySeat, slotIndex: firstEmpty };
                    }
                }
            }
        }
        return null;
    }

    private onPointerOver(cardId: string): void {
        const vfx = this.cardVFXMap.get(cardId);
        if (vfx) {
            vfx.hover();
        }
    }

    private onPointerOut(cardId: string): void {
        const vfx = this.cardVFXMap.get(cardId);
        if (vfx) {
            vfx.unhover();
        }
    }

    // ===========================================================================
    // UI Update
    // ===========================================================================

    private updateUI(): void {
        if (!this.state) return;

        // Update background color based on player seat
        this.updateBackgroundColor();

        // Handle crisis modal
        if (this.state.pendingCrisis) {
            this.crisisModal.show(
                {
                    cardInstanceId: this.state.pendingCrisis.cardInstanceId,
                    deadlineMs: this.state.pendingCrisis.deadlineMs,
                },
                () => this.crisisModal.hide()
            );
        } else {
            this.crisisModal.hide();
        }

        this.updateHand();
        this.updateDistricts();
        this.updatePlayerHUD();
        this.updateOpponentHands();
        this.updateTurnEmphasis();
    }

    private updateTurnEmphasis(): void {
        if (!this.state?.round || !this.state.mySeat) return;

        const round = this.state.round;
        const mySeat = this.state.mySeat;
        const isMyTurn = this.state.isMyTurn;

        // Update turn snackbar
        this.turnSnackbar.update(isMyTurn, round.active_seat);

        // Update pyramid interactability - dim unavailable pyramids
        round.districts.forEach((districtInfo, idx) => {
            const pyramid = this.pyramidDistricts[idx];
            if (!pyramid) return;

            // A pyramid is interactable if:
            // 1. It's my turn
            // 2. District is not claimed
            // 3. I have at least one empty slot there
            const isClaimed = districtInfo.claimed_by !== null;
            const myCards = districtInfo.sides[mySeat].cards.filter(c => c !== null).length;
            const hasEmptySlot = myCards < 3;
            const canInteract = isMyTurn && !isClaimed && hasEmptySlot;

            pyramid.setInteractable(canInteract);
        });
    }

    private updateOpponentHands(): void {
        if (!this.state?.mySeat || !this.state.round) return;

        const mySeat = this.state.mySeat;
        const handCounts = this.state.round.hand_counts;

        // Determine opponent seats based on my position
        // Seating order: LEFT, RIGHT, INDEP (clockwise)
        const seats: Seat[] = ['LEFT', 'RIGHT', 'INDEP'];
        const myIndex = seats.indexOf(mySeat);
        const leftOpponentSeat = seats[(myIndex + 1) % 3];
        const rightOpponentSeat = seats[(myIndex + 2) % 3];

        // Get current screen dimensions
        const width = this.app.screen.width;
        const height = this.app.screen.height;

        // Create opponent hands if not yet created
        if (!this.opponentHandLeft) {
            this.opponentHandLeft = new OpponentHand('left', leftOpponentSeat);
            this.container.addChildAt(this.opponentHandLeft, 0);
            // Position immediately
            this.opponentHandLeft.x = 0;
            this.opponentHandLeft.y = 0;
            this.opponentHandLeft.setScreenHeight(height);
        }
        if (!this.opponentHandRight) {
            this.opponentHandRight = new OpponentHand('right', rightOpponentSeat);
            this.container.addChildAt(this.opponentHandRight, 0);
            // Position immediately
            this.opponentHandRight.x = width;
            this.opponentHandRight.y = 0;
            this.opponentHandRight.setScreenHeight(height);
        }

        // Update card counts
        this.opponentHandLeft.setCardCount(handCounts[leftOpponentSeat] || 0);
        this.opponentHandRight.setCardCount(handCounts[rightOpponentSeat] || 0);
    }

    private updateBackgroundColor(): void {
        if (!this.state?.mySeat) return;

        // Set background color based on player's faction
        const bgColors: Record<string, number> = {
            LEFT: 0x2a1515,    // Dark red tint
            RIGHT: 0x15202a,   // Dark blue tint
            INDEP: 0x2a2515,   // Dark yellow/gold tint
        };

        const color = bgColors[this.state.mySeat] || 0x1A1A1A;
        this.app.renderer.background.color = color;
    }

    private updatePlayerHUD(): void {
        if (!this.state?.round) return;

        const round = this.state.round;

        // Update active seat
        if (round.active_seat) {
            this.playerHUD.setActiveSeat(round.active_seat);
        }

        // Calculate scores (count claimed districts)
        const scores: Record<Seat, number> = { LEFT: 0, RIGHT: 0, INDEP: 0 };
        round.districts.forEach((d) => {
            if (d.status === 'CLAIMED' && d.claimed_by) {
                scores[d.claimed_by]++;
            }
        });
        this.playerHUD.updateScores(scores);

        // Update round and turn info
        const round_num = 1; // TODO: Get from match state when available
        const total_rounds = 3; // Best of 3
        this.playerHUD.updateRound(round_num, total_rounds);

        // Calculate turn logic (Turn 1-21)
        // Total cards on board / 3 players = current turn cycle
        const totalPlayed = round.districts.reduce((sum, d) => {
            return sum + Object.values(d.sides).reduce((s, side) => s + side.cards.filter(c => c !== null).length, 0);
        }, 0);
        const currentTurn = Math.floor(totalPlayed / 3) + 1;
        this.playerHUD.updateTurn(currentTurn, 21); // 21 turns per player max
    }

    private updateDistricts(): void {
        if (!this.state?.round) return;

        const round = this.state.round;

        console.log('[MatchScene] updateDistricts activeSeat:', round.active_seat);

        round.districts.forEach((districtInfo, idx) => {
            const pyramid = this.pyramidDistricts[idx];
            if (!pyramid) return;

            // Updated Claim Status
            pyramid.setClaimed(districtInfo.claimed_by || null);

            // Update Turn Stacks (attached to pyramid)
            pyramid.updateTurnStacks(round.active_seat, districtInfo);

            // Contested state: multiple players have cards and not claimed
            if (!districtInfo.claimed_by) {
                const seatsWithCards = (['LEFT', 'RIGHT', 'INDEP'] as const)
                    .filter(seat => districtInfo.sides[seat].cards.some(c => c !== null)).length;
                pyramid.setContested(seatsWithCards >= 2);
            } else {
                pyramid.setContested(false);
            }

            // Minicard slot icons removed - using full TurnStack display instead
        });
    }

    // (updateInfo removed - PlayerHUD handles this now)

    // ===========================================================================
    // Resize
    // ===========================================================================

    public onResize(width: number, height: number): void {
        const cx = width / 2;
        const cy = height / 2;

        // Mobile breakpoint: 768px
        const isMobile = width < 768;
        const isTablet = width >= 768 && width < 1024;

        if (isMobile) {
            // Mobile: Single column, vertical layout
            const pyramidSize = 80;
            const spacingY = 180;
            const startY = 150;

            this.pyramidDistricts.forEach((pyramid, idx) => {
                pyramid.x = cx;
                pyramid.y = startY + idx * spacingY;
                pyramid.scale.set(pyramidSize / 100);
            });

            // Enable vertical scrolling via container bounds
            this.boardContainer.y = 0;

            // Position hand at bottom (fixed)
            this.handContainer.x = cx;
            this.handContainer.y = height - 100;

        } else if (isTablet) {
            // Tablet: 2 rows of 4 and 3
            const spacingX = 200;
            const spacingY = 220;
            const startY = 150;

            this.pyramidDistricts.forEach((pyramid, idx) => {
                if (idx < 4) {
                    pyramid.x = cx + (idx - 1.5) * spacingX;
                    pyramid.y = startY;
                } else {
                    pyramid.x = cx + (idx - 5) * spacingX;
                    pyramid.y = startY + spacingY;
                }
                pyramid.scale.set(0.7);
            });

            this.handContainer.x = cx;
            this.handContainer.y = height - 80;

        } else {
            // Desktop: 2 rows (4 on top, 3 on bottom)
            const spacingX = Math.min(300, width / 4);
            const spacingY = 280;
            const topRowY = cy - spacingY / 2 - 40;
            const bottomRowY = cy + spacingY / 2 - 40;

            this.pyramidDistricts.forEach((pyramid, idx) => {
                if (idx < 4) {
                    // Top row: 4 districts centered
                    pyramid.x = cx + (idx - 1.5) * spacingX;
                    pyramid.y = topRowY;
                } else {
                    // Bottom row: 3 districts centered
                    pyramid.x = cx + (idx - 5) * spacingX;
                    pyramid.y = bottomRowY;
                }
                pyramid.scale.set(0.8);
            });

            this.handContainer.x = cx;
            this.handContainer.y = height - 80;
        }

        // Player HUD position
        this.playerHUD.x = cx;
        this.playerHUD.y = isMobile ? 50 : 45;

        // Hand strengths drawer (right edge, vertically centered)
        this.handStrengthsDrawer.x = width;
        this.handStrengthsDrawer.y = cy - this.handStrengthsDrawer.getDrawerHeight() / 2;

        // Opponent hand displays (left and right screen edges)
        // Hide on small viewports to avoid overlap with drawer tabs
        const showOpponentHands = width >= 700;
        if (this.opponentHandLeft) {
            this.opponentHandLeft.visible = showOpponentHands;
            this.opponentHandLeft.x = 0;
            this.opponentHandLeft.y = 0;
            this.opponentHandLeft.setScreenHeight(height);
        }
        if (this.opponentHandRight) {
            this.opponentHandRight.visible = showOpponentHands;
            this.opponentHandRight.x = width;
            this.opponentHandRight.y = 0;
            this.opponentHandRight.setScreenHeight(height);
        }

        // Game history drawer (left edge, vertically centered)
        this.gameHistoryDrawer.x = 0;
        this.gameHistoryDrawer.y = cy - this.gameHistoryDrawer.getDrawerHeight() / 2;

        // Turn snackbar (bottom center, above hand)
        this.turnSnackbar.x = cx;
        this.turnSnackbar.y = height - 180;
    }
}
