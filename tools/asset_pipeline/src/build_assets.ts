/**
 * MANDATE Asset Pipeline
 * Based on 09_asset_pipeline.md
 * 
 * This script:
 * 1. Normalizes card asset names (spaces → underscores, zero-pad values)
 * 2. Generates assets_runtime/ folder structure
 * 3. Generates card_catalog.json
 * 4. Generates asset_manifest.json
 * 
 * Run with: npm run build (from tools/asset_pipeline)
 */

import fs from 'node:fs';
import path from 'node:path';

// =============================================================================
// Configuration
// =============================================================================

const SOURCE_DIR = path.resolve('../../Card');
const OUTPUT_DIR = path.resolve('../../assets_runtime');
const MANIFEST_DIR = path.join(OUTPUT_DIR, 'manifests');

const ASSET_COLORS = [
    'institution',
    'base',
    'media',
    'capital',
    'ideology',
    'logistics',
] as const;

const ASSET_VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;

// =============================================================================
// Types
// =============================================================================

interface CardCatalogEntry {
    card_def_id: string;
    kind: 'ASSET' | 'CRISIS';
    asset_color?: string;
    asset_value?: string;
    display: {
        front_png: string;
        front_svg?: string;
        back_png: string;
    };
    vfx_profile: string;
}

interface AssetManifest {
    asset_manifest_version: string;
    atlases: Array<{ name: string; image: string; meta: string }>;
    raw_files: string[];
}

// =============================================================================
// Helpers
// =============================================================================

function zeroPadValue(value: string): string {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 2 && num <= 9) {
        return value.padStart(2, '0');
    }
    return value;
}

function generateCardCatalog(): CardCatalogEntry[] {
    const catalog: CardCatalogEntry[] = [];

    // Asset cards: 6 colors × 11 values
    for (const color of ASSET_COLORS) {
        for (const value of ASSET_VALUES) {
            const paddedValue = zeroPadValue(value);
            const cardDefId = `asset.${color}.${value}`;

            catalog.push({
                card_def_id: cardDefId,
                kind: 'ASSET',
                asset_color: color.toUpperCase(),
                asset_value: value,
                display: {
                    front_png: `assets_runtime/cards/fronts/${color}/${paddedValue}.png`,
                    front_svg: `assets_runtime/cards/svg/${color}/${paddedValue}.svg`,
                    back_png: 'assets_runtime/cards/back/card_back.png',
                },
                vfx_profile: `${color}_${paddedValue}`,
            });
        }
    }

    // Crisis cards: 3 total
    for (let i = 1; i <= 3; i++) {
        catalog.push({
            card_def_id: `crisis.${i}`,
            kind: 'CRISIS',
            display: {
                front_png: `assets_runtime/cards/crisis/crisis_0${i}.png`,
                front_svg: 'assets_runtime/cards/crisis/crisis.svg',
                back_png: 'assets_runtime/cards/back/card_back.png',
            },
            vfx_profile: 'crisis_default',
        });
    }

    return catalog;
}

function generateAssetManifest(catalog: CardCatalogEntry[]): AssetManifest {
    const rawFiles = new Set<string>();

    // Add all card display files
    for (const entry of catalog) {
        rawFiles.add(entry.display.front_png);
        rawFiles.add(entry.display.back_png);
        if (entry.display.front_svg) {
            rawFiles.add(entry.display.front_svg);
        }
    }

    // Add branding assets
    rawFiles.add('assets_runtime/branding/logo/mandate_logo.png');
    rawFiles.add('assets_runtime/branding/landing/landing_header_en.png');
    rawFiles.add('assets_runtime/branding/landing/landing_header_hu.png');

    return {
        asset_manifest_version: 'am_0.1.0',
        atlases: [], // Empty for now - atlas packing is optional
        raw_files: Array.from(rawFiles).sort(),
    };
}

// =============================================================================
// Copy Card Assets
// =============================================================================

function copyCardAssets(): void {
    if (!fs.existsSync(SOURCE_DIR)) return;

    // Source folder name mapping (with spaces)
    const colorFolderMap: Record<string, string> = {
        institution: 'Institution cards png',
        base: 'Base cards png',
        media: 'Media cards png',
        capital: 'Capital cards png',
        ideology: 'Ideology cards png',
        logistics: 'Logistics cards png',
    };

    // Create output directories
    for (const color of ASSET_COLORS) {
        const outDir = path.join(OUTPUT_DIR, 'cards', 'fronts', color);
        fs.mkdirSync(outDir, { recursive: true });
    }
    fs.mkdirSync(path.join(OUTPUT_DIR, 'cards', 'crisis'), { recursive: true });
    fs.mkdirSync(path.join(OUTPUT_DIR, 'cards', 'back'), { recursive: true });

    // Copy asset cards
    for (const color of ASSET_COLORS) {
        const sourceFolder = path.join(SOURCE_DIR, colorFolderMap[color]);
        const destFolder = path.join(OUTPUT_DIR, 'cards', 'fronts', color);

        if (!fs.existsSync(sourceFolder)) {
            console.warn(`[AssetPipeline] Source folder not found: ${sourceFolder}`);
            continue;
        }

        for (const value of ASSET_VALUES) {
            const paddedValue = zeroPadValue(value);
            const sourceFile = path.join(sourceFolder, `${value}.png`);
            const destFile = path.join(destFolder, `${paddedValue}.png`);

            if (fs.existsSync(sourceFile)) {
                fs.copyFileSync(sourceFile, destFile);
            } else {
                console.warn(`[AssetPipeline] Missing: ${sourceFile}`);
            }
        }
        console.log(`[AssetPipeline] Copied ${color} cards`);
    }

    // Copy crisis cards (all use the same source image)
    const crisisSource = path.join(SOURCE_DIR, 'Crisis.png');
    if (fs.existsSync(crisisSource)) {
        for (let i = 1; i <= 3; i++) {
            const destFile = path.join(OUTPUT_DIR, 'cards', 'crisis', `crisis_0${i}.png`);
            fs.copyFileSync(crisisSource, destFile);
        }
        console.log('[AssetPipeline] Copied crisis cards');
    }

    // Create card back placeholder if not exists
    const cardBackDest = path.join(OUTPUT_DIR, 'cards', 'back', 'card_back.png');
    if (!fs.existsSync(cardBackDest)) {
        // Check if there's a source card back
        const cardBackSource = path.join(SOURCE_DIR, 'back.png');
        if (fs.existsSync(cardBackSource)) {
            fs.copyFileSync(cardBackSource, cardBackDest);
            console.log('[AssetPipeline] Copied card back');
        } else {
            console.warn('[AssetPipeline] No card back found, will use fallback in client');
        }
    }
}

// =============================================================================
// Main
// =============================================================================

function main() {
    console.log('[AssetPipeline] Starting asset build...');
    console.log(`[AssetPipeline] Source: ${SOURCE_DIR}`);
    console.log(`[AssetPipeline] Output: ${OUTPUT_DIR}`);

    // Check if source exists
    if (!fs.existsSync(SOURCE_DIR)) {
        console.warn(`[AssetPipeline] Source directory not found: ${SOURCE_DIR}`);
        console.log('[AssetPipeline] Generating manifest stubs only...');
    }

    // Create output directories
    fs.mkdirSync(MANIFEST_DIR, { recursive: true });

    // Copy card assets
    copyCardAssets();

    // Generate card catalog
    const catalog = generateCardCatalog();
    const catalogPath = path.join(MANIFEST_DIR, 'card_catalog.json');
    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');
    console.log(`[AssetPipeline] Wrote ${catalogPath} (${catalog.length} entries)`);

    // Generate asset manifest
    const manifest = generateAssetManifest(catalog);
    const manifestPath = path.join(MANIFEST_DIR, 'asset_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`[AssetPipeline] Wrote ${manifestPath}`);

    // Generate build report
    const buildReport = {
        build_time: new Date().toISOString(),
        asset_manifest_version: manifest.asset_manifest_version,
        total_cards: catalog.length,
        asset_cards: catalog.filter(c => c.kind === 'ASSET').length,
        crisis_cards: catalog.filter(c => c.kind === 'CRISIS').length,
        raw_files_count: manifest.raw_files.length,
        atlases_count: manifest.atlases.length,
    };
    const reportPath = path.join(MANIFEST_DIR, 'build_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(buildReport, null, 2), 'utf-8');
    console.log(`[AssetPipeline] Wrote ${reportPath}`);

    console.log('[AssetPipeline] Build complete!');
}

main();
