/**
 * MANDATE Audio SFX Generator
 * Based on 16_audio_system.md
 * 
 * One-time SFX generation script using ElevenLabs API.
 * Generates SFX once at build-time, not at runtime.
 * 
 * Usage:
 * 1. Set ELEVENLABS_API_KEY environment variable
 * 2. Run: npm run generate (from tools/audio)
 * 
 * NOTE: This is a stub. To generate actual SFX:
 * 1. Install elevenlabs SDK: npm install elevenlabs
 * 2. Uncomment the ElevenLabs integration code
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

// =============================================================================
// Configuration
// =============================================================================

const OUTPUT_DIR = path.resolve('../../assets_runtime/audio');
const SFX_DIR = path.join(OUTPUT_DIR, 'sfx');
const MUSIC_DIR = path.join(OUTPUT_DIR, 'music');
const MANIFEST_DIR = path.join(OUTPUT_DIR, 'manifests');

// =============================================================================
// SFX Definitions (from 16_audio_system.md)
// =============================================================================

const SFX_DEFINITIONS = [
    // UI Navigation & Buttons
    { id: 'ui_click_primary', prompt: 'Short clean UI button click, modern app, subtle' },
    { id: 'ui_click_secondary', prompt: 'Soft UI tap, minimal, quieter than primary click' },
    { id: 'ui_toggle_on', prompt: 'Toggle switch on, light snap, minimal' },
    { id: 'ui_toggle_off', prompt: 'Toggle switch off, light snap, minimal' },
    { id: 'ui_hover', prompt: 'Very subtle hover feedback, soft whoosh' },
    { id: 'ui_error', prompt: 'Soft error blip, modern UI, not harsh' },
    { id: 'ui_modal_open', prompt: 'Modal open, soft expand sound' },
    { id: 'ui_modal_close', prompt: 'Modal close, soft collapse sound' },

    // Lobby
    { id: 'lobby_join', prompt: 'Successful join, welcoming chime' },
    { id: 'lobby_ready', prompt: 'Ready confirmation, positive tone' },
    { id: 'lobby_all_ready', prompt: 'All players ready, exciting buildup' },

    // Card Interactions
    { id: 'card_pickup', prompt: 'Card picked up from table, soft whoosh, subtle paper' },
    { id: 'card_drop_valid', prompt: 'Card placed onto table slot, satisfying tap' },
    { id: 'card_drop_invalid', prompt: 'Soft thud and quick reject blip' },
    { id: 'card_draw', prompt: 'Quick card draw whoosh, light and crisp' },
    { id: 'card_hover', prompt: 'Very subtle card hover, paper rustle' },

    // District / Claim
    { id: 'district_claim', prompt: 'Short victory stamp, digital thump, clean' },
    { id: 'district_claim_total_mandate', prompt: 'Stronger victory stamp, triple pulse, powerful' },

    // Crisis
    { id: 'crisis_played', prompt: 'Fracture impact, glassy crack, digital' },
    { id: 'crisis_confirm', prompt: 'Confirmation chime, tense but clean' },

    // Match Flow
    { id: 'match_start', prompt: 'Match beginning, epic short fanfare' },
    { id: 'round_start', prompt: 'Round starting, building tension' },
    { id: 'turn_start_yours', prompt: 'Your turn notification, attention grabbing' },
    { id: 'round_win', prompt: 'Round victory, triumphant short melody' },
    { id: 'round_lose', prompt: 'Round loss, somber but brief' },

    // Network
    { id: 'net_reconnecting', prompt: 'Soft reconnect pulse, subtle alert' },
    { id: 'net_reconnected', prompt: 'Reconnect success chime, minimal' },
];

// Music tracks (these should be added manually)
const MUSIC_TRACKS = [
    { id: 'lobby', file: 'lobby.mp3', loop: true },
    { id: 'round1', file: 'round1.mp3', loop: true },
    { id: 'round2', file: 'round2.mp3', loop: true },
    { id: 'round3', file: 'round3.mp3', loop: true },
    { id: 'tiebreaker', file: 'tiebreaker.mp3', loop: true },
    { id: 'gameendwin', file: 'gameendwin.mp3', loop: false },
    { id: 'gameendlose', file: 'gameendlose.mp3', loop: false },
];

// =============================================================================
// Types
// =============================================================================

interface AudioManifest {
    version: string;
    sfx: Array<{ id: string; file: string }>;
    music: Array<{ id: string; file: string; loop: boolean }>;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
    console.log('[AudioPipeline] Starting audio manifest generation...');

    // Check for API key
    if (!process.env.ELEVENLABS_API_KEY) {
        console.warn('[AudioPipeline] ELEVENLABS_API_KEY not set');
        console.log('[AudioPipeline] Generating manifest stub only (no actual SFX generation)');
    }

    // Create output directories
    fs.mkdirSync(SFX_DIR, { recursive: true });
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
    fs.mkdirSync(MANIFEST_DIR, { recursive: true });

    // Generate audio manifest
    const manifest: AudioManifest = {
        version: 'audio_0.1.0',
        sfx: SFX_DEFINITIONS.map(s => ({
            id: s.id,
            file: `assets_runtime/audio/sfx/${s.id}.mp3`,
        })),
        music: MUSIC_TRACKS.map(m => ({
            id: m.id,
            file: `assets_runtime/audio/music/${m.file}`,
            loop: m.loop,
        })),
    };

    const manifestPath = path.join(MANIFEST_DIR, 'audio_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`[AudioPipeline] Wrote ${manifestPath}`);

    // Log SFX definitions for reference
    const sfxDefsPath = path.join(MANIFEST_DIR, 'sfx_prompts.json');
    fs.writeFileSync(sfxDefsPath, JSON.stringify(SFX_DEFINITIONS, null, 2), 'utf-8');
    console.log(`[AudioPipeline] Wrote ${sfxDefsPath} (${SFX_DEFINITIONS.length} SFX prompts)`);

    console.log('[AudioPipeline] Done!');
    console.log('');
    console.log('To generate actual SFX files:');
    console.log('1. Set ELEVENLABS_API_KEY environment variable');
    console.log('2. Install elevenlabs SDK: npm install elevenlabs');
    console.log('3. Uncomment ElevenLabs integration in this script');
}

main().catch(console.error);
