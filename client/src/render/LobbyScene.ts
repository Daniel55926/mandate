/**
 * LobbyScene - Full Lobby UI
 * Home view → Room view with seats, ready toggles, invite code
 */

import { Container, Text, Graphics, Application } from 'pixi.js';
import { COLORS } from '../main';
import { WsClient } from '../net/WsClient';
import { lobbyStore, type LobbyState, type PlayerInfo } from '../state/LobbyStore';

// =============================================================================
// LobbyScene
// =============================================================================

export class LobbyScene {
    public readonly container: Container;

    // Application reference available if needed
    private wsClient: WsClient;

    // Views
    private homeView: Container;
    private roomView: Container;
    private loadingOverlay: Container;

    // Home view elements
    private titleText!: Text;
    private subtitleText!: Text;
    private createRoomBtn!: Container;
    private joinRoomBtn!: Container;
    private joinCodeInput: string = '';
    // Join code input text (future use)

    // Room view elements
    private inviteCodeText!: Text;
    private copyBtn!: Container;
    private seatContainers: Container[] = [];
    private readyBtn!: Container;
    private readyBtnText!: Text;
    private leaveBtn!: Container;
    private phaseText!: Text;

    // Status
    private statusText!: Text;

    // State
    private currentState: LobbyState | null = null;

    constructor(_app: Application, wsClient: WsClient) {
        this.wsClient = wsClient;
        this.container = new Container();

        // Create views
        this.homeView = new Container();
        this.roomView = new Container();
        this.loadingOverlay = new Container();
        this.loadingOverlay.visible = false;

        this.container.addChild(this.homeView);
        this.container.addChild(this.roomView);
        this.container.addChild(this.loadingOverlay);

        this.setupHomeView();
        this.setupRoomView();
        this.setupLoadingOverlay();
        this.setupStatusText();

        // Subscribe to lobby store
        lobbyStore.subscribe((state) => {
            this.currentState = state;
            this.updateUI(state);
        });

        // Connect WsClient events to LobbyStore
        this.wsClient.onStatusChange((status) => {
            lobbyStore.setConnected(
                status === 'connected',
                status === 'connected' ? this.wsClient.currentPlayerId : null
            );
            this.updateStatusText(status);
        });

        this.wsClient.onEvent((event) => {
            lobbyStore.handleEvent(event);
        });

        this.wsClient.onSnapshot((snapshot) => {
            lobbyStore.handleSnapshot(snapshot);
        });

        // Auto-connect
        this.wsClient.connect();
    }

    // ===========================================================================
    // Home View Setup
    // ===========================================================================

    private setupHomeView(): void {
        // Title
        this.titleText = new Text({
            text: 'MANDATE',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 72,
                fontWeight: 'bold',
                fill: COLORS.TEXT_LIGHT,
                letterSpacing: 8,
            },
        });
        this.titleText.anchor.set(0.5);
        this.homeView.addChild(this.titleText);

        // Subtitle
        this.subtitleText = new Text({
            text: 'The District Game',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 24,
                fill: COLORS.DIVIDER,
                letterSpacing: 2,
            },
        });
        this.subtitleText.anchor.set(0.5);
        this.homeView.addChild(this.subtitleText);

        // Create Room Button
        this.createRoomBtn = this.createButton('CREATE ROOM', COLORS.INSTITUTION, () => {
            this.wsClient.sendIntent('CREATE_ROOM', {});
        });
        this.homeView.addChild(this.createRoomBtn);

        // Join Room Button
        this.joinRoomBtn = this.createButton('JOIN ROOM', COLORS.BASE, () => {
            if (this.joinCodeInput.length > 0) {
                this.wsClient.sendIntent('JOIN_ROOM', { room_id: this.joinCodeInput });
            } else {
                // Prompt for code (simple implementation - use typed code)
                const code = prompt('Enter room code:');
                if (code) {
                    this.wsClient.sendIntent('JOIN_ROOM', { room_id: code.toUpperCase() });
                }
            }
        });
        this.homeView.addChild(this.joinRoomBtn);
    }

    // ===========================================================================
    // Room View Setup
    // ===========================================================================

    private setupRoomView(): void {
        this.roomView.visible = false;

        // Invite Code Header
        const inviteLabel = new Text({
            text: 'INVITE CODE',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
                fill: COLORS.DIVIDER,
                letterSpacing: 2,
            },
        });
        inviteLabel.anchor.set(0.5);
        inviteLabel.label = 'inviteLabel';
        this.roomView.addChild(inviteLabel);

        this.inviteCodeText = new Text({
            text: '------',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 48,
                fontWeight: 'bold',
                fill: COLORS.TEXT_LIGHT,
                letterSpacing: 8,
            },
        });
        this.inviteCodeText.anchor.set(0.5);
        this.roomView.addChild(this.inviteCodeText);

        // Copy Button
        this.copyBtn = this.createButton('COPY', COLORS.DIVIDER, () => {
            if (this.currentState?.room?.invite_code) {
                navigator.clipboard.writeText(this.currentState.room.invite_code);
            }
        }, 100, 36);
        this.roomView.addChild(this.copyBtn);

        // Phase Text
        this.phaseText = new Text({
            text: 'Waiting for players...',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 18,
                fill: COLORS.MEDIA,
            },
        });
        this.phaseText.anchor.set(0.5);
        this.roomView.addChild(this.phaseText);

        // 3 Seat Containers
        for (let i = 0; i < 3; i++) {
            const seat = this.createSeatContainer(i);
            this.seatContainers.push(seat);
            this.roomView.addChild(seat);
        }

        // Ready Button
        this.readyBtn = this.createButton('READY', COLORS.BASE, () => {
            const myPlayer = lobbyStore.getMyPlayer();
            if (myPlayer) {
                this.wsClient.sendIntent('SET_READY', { ready: !myPlayer.ready });
            }
        });
        this.roomView.addChild(this.readyBtn);

        // Ready button text reference
        this.readyBtnText = this.readyBtn.getChildAt(1) as Text;

        // Leave Button
        this.leaveBtn = this.createButton('LEAVE', COLORS.CAPITAL, () => {
            this.wsClient.sendIntent('LEAVE_ROOM', {});
            lobbyStore.leaveRoom();
        }, 120, 40);
        this.roomView.addChild(this.leaveBtn);
    }

    private createSeatContainer(index: number): Container {
        const seat = new Container();
        seat.label = `seat_${index}`;

        const bg = new Graphics();
        bg.roundRect(0, 0, 200, 80, 8);
        bg.fill({ color: 0x2a2a2a });
        bg.stroke({ width: 2, color: COLORS.DIVIDER });
        seat.addChild(bg);

        const nameText = new Text({
            text: 'Waiting...',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 18,
                fill: COLORS.DIVIDER,
            },
        });
        nameText.label = 'nameText';
        nameText.x = 15;
        nameText.y = 20;
        seat.addChild(nameText);

        const statusText = new Text({
            text: '',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
                fill: COLORS.DIVIDER,
            },
        });
        statusText.label = 'statusText';
        statusText.x = 15;
        statusText.y = 48;
        seat.addChild(statusText);

        // Host crown indicator
        const hostIndicator = new Text({
            text: '👑',
            style: { fontSize: 20 },
        });
        hostIndicator.label = 'hostIndicator';
        hostIndicator.x = 170;
        hostIndicator.y = 10;
        hostIndicator.visible = false;
        seat.addChild(hostIndicator);

        seat.pivot.set(100, 40);
        return seat;
    }

    // ===========================================================================
    // Loading Overlay Setup
    // ===========================================================================

    private setupLoadingOverlay(): void {
        const bg = new Graphics();
        bg.rect(0, 0, 2000, 2000);
        bg.fill({ color: 0x000000, alpha: 0.8 });
        this.loadingOverlay.addChild(bg);

        const loadingText = new Text({
            text: 'Loading match...',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 32,
                fill: COLORS.TEXT_LIGHT,
            },
        });
        loadingText.anchor.set(0.5);
        loadingText.label = 'loadingText';
        this.loadingOverlay.addChild(loadingText);
    }

    // ===========================================================================
    // Status Text
    // ===========================================================================

    private setupStatusText(): void {
        this.statusText = new Text({
            text: '● Connecting...',
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
                fill: COLORS.MEDIA,
            },
        });
        this.statusText.anchor.set(0.5);
        this.container.addChild(this.statusText);
    }

    private updateStatusText(status: string): void {
        switch (status) {
            case 'connected':
                this.statusText.text = '● Connected';
                this.statusText.style.fill = COLORS.BASE;
                break;
            case 'connecting':
                this.statusText.text = '● Connecting...';
                this.statusText.style.fill = COLORS.MEDIA;
                break;
            case 'disconnected':
                this.statusText.text = '● Disconnected';
                this.statusText.style.fill = COLORS.CAPITAL;
                break;
        }
    }

    // ===========================================================================
    // UI Update
    // ===========================================================================

    private updateUI(state: LobbyState): void {
        const inRoom = state.inRoom && state.room;

        this.homeView.visible = !inRoom;
        this.roomView.visible = !!inRoom;
        this.loadingOverlay.visible = state.room?.room_phase === 'ROOM_LOADING';

        if (inRoom && state.room) {
            this.updateRoomView(state);
        }
    }

    private updateRoomView(state: LobbyState): void {
        const room = state.room!;

        // Update invite code
        this.inviteCodeText.text = room.invite_code;

        // Update phase text
        switch (room.room_phase) {
            case 'ROOM_OPEN':
                if (room.player_count < room.max_players) {
                    this.phaseText.text = `Waiting for players... (${room.player_count}/${room.max_players})`;
                } else {
                    this.phaseText.text = 'Ready to start!';
                }
                break;
            case 'ROOM_READY_CHECK':
                const readyCount = room.players.filter(p => p.ready).length;
                this.phaseText.text = `Ready check (${readyCount}/${room.max_players})`;
                break;
            case 'ROOM_LOADING':
                this.phaseText.text = 'Loading match...';
                break;
            case 'ROOM_IN_MATCH':
                this.phaseText.text = 'Match in progress';
                break;
        }

        // Update seats
        for (let i = 0; i < 3; i++) {
            const seat = this.seatContainers[i];
            const player = room.players[i] as PlayerInfo | undefined;
            const nameText = seat.getChildByName('nameText') as Text;
            const statusText = seat.getChildByName('statusText') as Text;
            const hostIndicator = seat.getChildByName('hostIndicator') as Text;
            const bg = seat.getChildAt(0) as Graphics;

            if (player) {
                nameText.text = player.display_name;
                nameText.style.fill = COLORS.TEXT_LIGHT;

                if (room.room_phase === 'ROOM_READY_CHECK' || room.room_phase === 'ROOM_OPEN') {
                    statusText.text = player.ready ? '✓ Ready' : 'Not ready';
                    statusText.style.fill = player.ready ? COLORS.BASE : COLORS.DIVIDER;
                } else if (room.room_phase === 'ROOM_LOADING') {
                    statusText.text = player.loaded ? '✓ Loaded' : 'Loading...';
                    statusText.style.fill = player.loaded ? COLORS.BASE : COLORS.MEDIA;
                } else {
                    statusText.text = '';
                }

                hostIndicator.visible = player.is_host;

                // Highlight own seat
                if (player.player_id === state.playerId) {
                    bg.clear();
                    bg.roundRect(0, 0, 200, 80, 8);
                    bg.fill({ color: 0x2a2a2a });
                    bg.stroke({ width: 2, color: COLORS.INSTITUTION });
                } else {
                    bg.clear();
                    bg.roundRect(0, 0, 200, 80, 8);
                    bg.fill({ color: 0x2a2a2a });
                    bg.stroke({ width: 2, color: COLORS.DIVIDER });
                }
            } else {
                nameText.text = 'Waiting...';
                nameText.style.fill = COLORS.DIVIDER;
                statusText.text = '';
                hostIndicator.visible = false;
                bg.clear();
                bg.roundRect(0, 0, 200, 80, 8);
                bg.fill({ color: 0x222222 });
                bg.stroke({ width: 2, color: 0x333333 });
            }
        }

        // Update ready button
        const myPlayer = room.players.find(p => p.player_id === state.playerId);
        if (myPlayer) {
            this.readyBtnText.text = myPlayer.ready ? 'UNREADY' : 'READY';
        }
    }

    // ===========================================================================
    // Button Helper
    // ===========================================================================

    private createButton(
        label: string,
        color: number,
        onClick: () => void,
        width = 280,
        height = 56
    ): Container {
        const btn = new Container();

        const bg = new Graphics();
        bg.roundRect(0, 0, width, height, 8);
        bg.fill({ color });
        btn.addChild(bg);

        const text = new Text({
            text: label,
            style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: height < 50 ? 14 : 18,
                fontWeight: 'bold',
                fill: COLORS.TEXT_LIGHT,
                letterSpacing: 2,
            },
        });
        text.anchor.set(0.5);
        text.x = width / 2;
        text.y = height / 2;
        btn.addChild(text);

        btn.pivot.set(width / 2, height / 2);

        btn.eventMode = 'static';
        btn.cursor = 'pointer';
        btn.on('pointerdown', onClick);
        btn.on('pointerover', () => { bg.alpha = 0.85; });
        btn.on('pointerout', () => { bg.alpha = 1; });

        return btn;
    }

    // ===========================================================================
    // Resize
    // ===========================================================================

    public onResize(width: number, height: number): void {
        const cx = width / 2;
        const cy = height / 2;

        // Home view
        this.titleText.x = cx;
        this.titleText.y = cy - 120;
        this.subtitleText.x = cx;
        this.subtitleText.y = cy - 60;
        this.createRoomBtn.x = cx;
        this.createRoomBtn.y = cy + 40;
        this.joinRoomBtn.x = cx;
        this.joinRoomBtn.y = cy + 110;

        // Room view
        const inviteLabel = this.roomView.getChildByName('inviteLabel') as Text;
        if (inviteLabel) {
            inviteLabel.x = cx;
            inviteLabel.y = 60;
        }
        this.inviteCodeText.x = cx;
        this.inviteCodeText.y = 110;
        this.copyBtn.x = cx;
        this.copyBtn.y = 160;
        this.phaseText.x = cx;
        this.phaseText.y = 210;

        // Seats
        const seatY = cy - 30;
        const seatSpacing = 220;
        this.seatContainers[0].x = cx - seatSpacing;
        this.seatContainers[0].y = seatY;
        this.seatContainers[1].x = cx;
        this.seatContainers[1].y = seatY;
        this.seatContainers[2].x = cx + seatSpacing;
        this.seatContainers[2].y = seatY;

        // Ready & Leave buttons
        this.readyBtn.x = cx;
        this.readyBtn.y = cy + 100;
        this.leaveBtn.x = cx;
        this.leaveBtn.y = height - 50;

        // Status
        this.statusText.x = cx;
        this.statusText.y = height - 20;

        // Loading overlay
        const loadingText = this.loadingOverlay.getChildByName('loadingText') as Text;
        if (loadingText) {
            loadingText.x = cx;
            loadingText.y = cy;
        }
    }
}
