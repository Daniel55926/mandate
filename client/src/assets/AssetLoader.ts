/**
 * AssetLoader - Load card assets via manifest
 * Per 09_asset_pipeline.md
 */

import { Assets, Texture } from 'pixi.js';

// =============================================================================
// Types
// =============================================================================

interface CardDisplay {
    front_png: string;
    front_svg?: string;
    back_png: string;
}

interface CardCatalogEntry {
    card_def_id: string;
    kind: 'ASSET' | 'CRISIS';
    asset_color?: string;
    asset_value?: string;
    display: CardDisplay;
    vfx_profile: string;
}

// =============================================================================
// AssetLoader
// =============================================================================

class AssetLoaderClass {
    private catalog: CardCatalogEntry[] = [];
    private catalogMap: Map<string, CardCatalogEntry> = new Map();
    private textureCache: Map<string, Texture> = new Map();
    private loaded = false;

    /**
     * Load the card catalog from manifest
     */
    async loadCatalog(): Promise<void> {
        if (this.loaded) return;

        try {
            const response = await fetch('/manifests/card_catalog.json');
            if (!response.ok) {
                console.warn('[AssetLoader] Failed to load card catalog, using fallback');
                return;
            }

            this.catalog = await response.json();

            // Build lookup map
            for (const entry of this.catalog) {
                this.catalogMap.set(entry.card_def_id, entry);
            }

            console.log(`[AssetLoader] Loaded ${this.catalog.length} card definitions`);
            this.loaded = true;
        } catch (err) {
            console.error('[AssetLoader] Error loading catalog:', err);
        }
    }

    /**
     * Preload all card textures
     */
    async preloadTextures(): Promise<void> {
        if (!this.loaded) {
            await this.loadCatalog();
        }

        const loadPromises: Promise<void>[] = [];

        for (const entry of this.catalog) {
            const promise = this.loadTexture(entry.card_def_id, entry.display.front_png);
            loadPromises.push(promise);
        }

        await Promise.all(loadPromises);
        console.log(`[AssetLoader] Preloaded ${this.textureCache.size} textures`);
    }

    /**
     * Load a single texture
     */
    private async loadTexture(cardDefId: string, catalogPath: string): Promise<void> {
        try {
            // Strip assets_runtime prefix since publicDir points there
            const cleanPath = catalogPath.replace(/^assets_runtime\//, '/');
            const url = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
            const texture = await Assets.load<Texture>(url);
            this.textureCache.set(cardDefId, texture);
        } catch (err) {
            // Texture load failed - will use fallback
            console.warn(`[AssetLoader] Failed to load texture for ${cardDefId}:`, err);
        }
    }

    /**
     * Get texture for a card definition
     * Returns cached texture or fallback
     */
    getCardTexture(cardDefId: string): Texture | null {
        return this.textureCache.get(cardDefId) || null;
    }

    /**
     * Get card catalog entry
     */
    getCardEntry(cardDefId: string): CardCatalogEntry | undefined {
        return this.catalogMap.get(cardDefId);
    }

    /**
     * Get VFX profile for a card
     */
    getVFXProfile(cardDefId: string): string {
        const entry = this.catalogMap.get(cardDefId);
        return entry?.vfx_profile || 'default';
    }

    /**
     * Get all catalog entries
     */
    getCatalog(): CardCatalogEntry[] {
        return this.catalog;
    }

    /**
     * Check if catalog is loaded
     */
    isLoaded(): boolean {
        return this.loaded;
    }

    /**
     * Get texture for a card by color and value (for declared crisis cards)
     */
    getCardTextureByColorValue(color: string, value: string): Texture | null {
        // Find the card with matching color and value
        const entry = this.catalog.find(e =>
            e.kind === 'ASSET' &&
            e.asset_color === color &&
            e.asset_value === value
        );
        if (entry) {
            return this.textureCache.get(entry.card_def_id) || null;
        }
        return null;
    }
}

// Singleton export
export const AssetLoader = new AssetLoaderClass();
