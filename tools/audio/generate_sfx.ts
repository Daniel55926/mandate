/**
 * SFX Generator Script - One-time ElevenLabs import
 * Per 16_audio_system.md
 * 
 * Usage: npx tsx tools/audio/generate_sfx.ts
 * 
 * Requirements:
 * - ELEVENLABS_API_KEY in .local.env
 * - elevenlabs npm package installed
 * 
 * This script generates SFX files ONCE and saves them to assets_runtime.
 * Commit the generated files - no runtime API calls needed.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

// Check for API key
const API_KEY = process.env.ELEVENLABS_API_KEY;

const OUT_DIR = path.resolve('assets_runtime/audio/sfx');
const MANIFEST_DIR = path.resolve('assets_runtime/audio/manifests');

// SFX definitions per 16_audio_system.md
const SFX_PROMPTS: Array<{ id: string; prompt: string }> = [
    // UI Navigation
    { id: 'ui_click_primary', prompt: 'Short clean UI button click, modern app, subtle' },
    { id: 'ui_click_secondary', prompt: 'Soft UI tap, minimal, quieter than primary click' },
    { id: 'ui_hover', prompt: 'Very subtle UI hover sound, barely audible' },
    { id: 'ui_error', prompt: 'Soft error blip, modern UI, not harsh' },

    // Card Interactions
    { id: 'card_pickup', prompt: 'Card picked up from table, soft whoosh, subtle paper' },
    { id: 'card_drop_valid', prompt: 'Card placed onto table slot, satisfying tap, minimal' },
    { id: 'card_drop_invalid', prompt: 'Soft thud and quick reject blip, UI feedback' },
    { id: 'card_draw', prompt: 'Quick card draw whoosh, light and crisp' },

    // District / Claim
    { id: 'district_claim', prompt: 'Short victory stamp, digital thump, clean' },
    { id: 'district_claim_total_mandate', prompt: 'Stronger victory stamp, triple pulse, powerful' },

    // Crisis
    { id: 'crisis_played', prompt: 'Fracture impact, glassy crack, digital, restrained' },
    { id: 'crisis_confirm', prompt: 'Confirmation chime, tense but clean' },

    // Network
    { id: 'net_reconnecting', prompt: 'Soft reconnect pulse, subtle alert' },
    { id: 'net_reconnected', prompt: 'Reconnect success chime, minimal' },
];

async function main() {
    console.log('[SFX Generator] Starting...');

    if (!API_KEY) {
        console.error('\n[ERROR] Missing ELEVENLABS_API_KEY environment variable');
        console.log('Add it to your .local.env file:\n');
        console.log('  ELEVENLABS_API_KEY=your_api_key_here\n');
        console.log('For now, creating placeholder manifest without audio files.');
        console.log('You can generate actual SFX later when you have an API key.\n');

        // Create directories
        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.mkdirSync(MANIFEST_DIR, { recursive: true });

        // Write manifest (files won't exist but structure is ready)
        const manifest = {
            version: 'audio_0.1.0_placeholder',
            sfx: SFX_PROMPTS.map(s => ({
                id: s.id,
                file: `assets_runtime/audio/sfx/${s.id}.mp3`,
            })),
            music: [
                { id: 'lobby', file: 'assets_runtime/audio/music/lobby.mp3', loop: true },
                { id: 'round1', file: 'assets_runtime/audio/music/round1.mp3', loop: true },
                { id: 'round2', file: 'assets_runtime/audio/music/round2.mp3', loop: true },
                { id: 'round3', file: 'assets_runtime/audio/music/round3.mp3', loop: true },
                { id: 'tiebreaker', file: 'assets_runtime/audio/music/tiebreaker.mp3', loop: true },
                { id: 'gameendwin', file: 'assets_runtime/audio/music/gameendwin.mp3', loop: false },
                { id: 'gameendlose', file: 'assets_runtime/audio/music/gameendlose.mp3', loop: false },
            ],
        };

        const manifestPath = path.join(MANIFEST_DIR, 'audio_manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
        console.log(`[SFX Generator] Wrote placeholder manifest: ${manifestPath}`);
        return;
    }

    // Load ElevenLabs SDK dynamically
    let ElevenLabs: any;
    try {
        // @ts-ignore - elevenlabs is an optional dependency, only needed when generating new SFX
        ElevenLabs = (await import('elevenlabs')).ElevenLabs;
    } catch (err) {
        console.error('[ERROR] elevenlabs package not installed.');
        console.log('Install it with: npm install elevenlabs\n');
        process.exit(1);
    }

    const eleven = new ElevenLabs({ apiKey: API_KEY });

    // Create directories
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.mkdirSync(MANIFEST_DIR, { recursive: true });

    console.log(`[SFX Generator] Generating ${SFX_PROMPTS.length} sound effects...`);

    for (const sfx of SFX_PROMPTS) {
        const outPath = path.join(OUT_DIR, `${sfx.id}.mp3`);

        if (fs.existsSync(outPath)) {
            console.log(`[Skip] ${sfx.id} already exists`);
            continue;
        }

        try {
            console.log(`[Generate] ${sfx.id}: "${sfx.prompt}"`);

            const audioBytes = await eleven.textToSoundEffects.convert({
                text: sfx.prompt,
            });

            fs.writeFileSync(outPath, Buffer.from(audioBytes));
            console.log(`[OK] Wrote ${outPath}`);
        } catch (err) {
            console.error(`[ERROR] Failed to generate ${sfx.id}:`, err);
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
    }

    // Write manifest
    const manifest = {
        version: 'audio_0.1.0',
        sfx: SFX_PROMPTS.map(s => ({
            id: s.id,
            file: `assets_runtime/audio/sfx/${s.id}.mp3`,
        })),
        music: [
            { id: 'lobby', file: 'assets_runtime/audio/music/lobby.mp3', loop: true },
            { id: 'round1', file: 'assets_runtime/audio/music/round1.mp3', loop: true },
            { id: 'round2', file: 'assets_runtime/audio/music/round2.mp3', loop: true },
            { id: 'round3', file: 'assets_runtime/audio/music/round3.mp3', loop: true },
            { id: 'tiebreaker', file: 'assets_runtime/audio/music/tiebreaker.mp3', loop: true },
            { id: 'gameendwin', file: 'assets_runtime/audio/music/gameendwin.mp3', loop: false },
            { id: 'gameendlose', file: 'assets_runtime/audio/music/gameendlose.mp3', loop: false },
        ],
    };

    const manifestPath = path.join(MANIFEST_DIR, 'audio_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`[SFX Generator] Wrote manifest: ${manifestPath}`);

    console.log('\n[SFX Generator] Done! Commit the generated files.\n');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
