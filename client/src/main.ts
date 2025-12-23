/**
 * MANDATE Client Entry Point
 * Scene switching between Lobby and Match
 */

import { Application } from 'pixi.js';
import { LobbyScene } from './render/LobbyScene';
import { MatchScene } from './render/MatchScene';
import { WsClient } from './net/WsClient';
import { lobbyStore } from './state/LobbyStore';
import { matchStore } from './state/MatchStore';

// Design system colors from desingsystem.md
export const COLORS = {
    // Primary Asset Colors
    INSTITUTION: 0x1F3A5F, // Deep Blue
    BASE: 0x3E6F4E,        // Muted Green
    MEDIA: 0xC9A227,       // Mustard Yellow
    CAPITAL: 0x7A1E1E,     // Dark Red
    IDEOLOGY: 0x4B2E5A,    // Dark Purple
    LOGISTICS: 0x4A4A4A,   // Graphite Grey

    // Neutral Colors
    BACKGROUND: 0x1A1A1A,
    CARD_BG: 0xF2F2F2,
    TEXT_DARK: 0x1A1A1A,
    TEXT_LIGHT: 0xFFFFFF,
    DIVIDER: 0xCCCCCC,
} as const;

type Scene = 'lobby' | 'match';

async function main() {
    // Create PixiJS application
    const app = new Application();

    await app.init({
        background: COLORS.BACKGROUND,
        resizeTo: window,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
    });

    // Add canvas to DOM
    const appContainer = document.getElementById('app');
    if (appContainer) {
        appContainer.appendChild(app.canvas);
    }

    // Determine WebSocket URL based on environment
    // In production, use wss:// with the same hostname
    // In development, use ws://localhost:3001
    const getWebSocketUrl = (): string => {
        // Check for environment variable override
        if (import.meta.env.VITE_WS_URL) {
            return import.meta.env.VITE_WS_URL;
        }
        // In production (not localhost), use same host with appropriate protocol
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            return `${protocol}//${window.location.host}`;
        }
        // Development fallback
        return 'ws://localhost:3001';
    };

    // Initialize WebSocket client
    const wsClient = new WsClient(getWebSocketUrl());

    // Create scenes
    const lobbyScene = new LobbyScene(app, wsClient);
    const matchScene = new MatchScene(app, wsClient);

    // Start with lobby visible
    app.stage.addChild(lobbyScene.container);
    matchScene.container.visible = false;
    app.stage.addChild(matchScene.container);

    let currentScene: Scene = 'lobby';

    // Scene switching
    function switchScene(scene: Scene) {
        if (currentScene === scene) return;
        currentScene = scene;

        lobbyScene.container.visible = scene === 'lobby';
        matchScene.container.visible = scene === 'match';

        if (scene === 'lobby') {
            lobbyScene.onResize(app.screen.width, app.screen.height);
        } else {
            matchScene.onResize(app.screen.width, app.screen.height);
        }

        console.log(`[Client] Switched to ${scene} scene`);
    }

    // Watch for match start
    wsClient.onEvent((event) => {
        // Forward to matchStore
        matchStore.handleEvent(event);

        if (event.type === 'MATCH_STARTED') {
            switchScene('match');
        }
        if (event.type === 'ROUND_ENDED') {
            // Could check for match end here
        }
    });

    // Set playerId when connected
    wsClient.onStatusChange((status) => {
        if (status === 'connected') {
            matchStore.setPlayerId(wsClient.currentPlayerId);
        }
    });

    // Watch for leaving room
    lobbyStore.subscribe((state) => {
        if (!state.inRoom && currentScene === 'match') {
            switchScene('lobby');
        }
    });

    // Handle resize
    window.addEventListener('resize', () => {
        if (currentScene === 'lobby') {
            lobbyScene.onResize(app.screen.width, app.screen.height);
        } else {
            matchScene.onResize(app.screen.width, app.screen.height);
        }
    });

    // Initial layout
    lobbyScene.onResize(app.screen.width, app.screen.height);

    console.log('[Client] MANDATE client initialized');
}

main().catch(console.error);
