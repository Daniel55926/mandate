/**
 * AudioManager - SFX playback for UI and gameplay events
 * Per 16_audio_system.md
 * 
 * Note: SFX are pre-generated files, no runtime API calls.
 * Music is deferred to next iteration.
 */

// =============================================================================
// Types
// =============================================================================

interface SFXEntry {
    id: string;
    file: string;
}

interface AudioManifest {
    version: string;
    sfx: SFXEntry[];
    music?: Array<{ id: string; file: string; loop: boolean }>;
}

// =============================================================================
// AudioManager
// =============================================================================

class AudioManagerClass {
    private manifest: AudioManifest | null = null;
    private sfxCache: Map<string, HTMLAudioElement> = new Map();
    private sfxEnabled = true;
    private sfxVolume = 0.8;

    /**
     * Load the audio manifest
     */
    async loadManifest(): Promise<void> {
        try {
            const response = await fetch('/assets_runtime/audio/manifests/audio_manifest.json');
            if (!response.ok) {
                console.warn('[AudioManager] No audio manifest found, SFX disabled');
                return;
            }

            this.manifest = await response.json();
            console.log(`[AudioManager] Loaded manifest: ${this.manifest?.sfx?.length || 0} SFX`);
        } catch (err) {
            console.warn('[AudioManager] Failed to load manifest:', err);
        }
    }

    /**
     * Preload core SFX files
     */
    async preloadSFX(): Promise<void> {
        if (!this.manifest?.sfx?.length) {
            console.warn('[AudioManager] No SFX to preload');
            return;
        }

        const loadPromises: Promise<void>[] = [];

        for (const sfx of this.manifest.sfx) {
            const promise = this.loadSFX(sfx.id, sfx.file);
            loadPromises.push(promise);
        }

        await Promise.all(loadPromises);
        console.log(`[AudioManager] Preloaded ${this.sfxCache.size} SFX files`);
    }

    /**
     * Load a single SFX file
     */
    private async loadSFX(id: string, path: string): Promise<void> {
        return new Promise((resolve) => {
            const audio = new Audio();
            audio.preload = 'auto';

            audio.oncanplaythrough = () => {
                this.sfxCache.set(id, audio);
                resolve();
            };

            audio.onerror = () => {
                console.warn(`[AudioManager] Failed to load SFX: ${id}`);
                resolve();
            };

            // Convert relative path to absolute
            audio.src = path.startsWith('/') ? path : `/${path}`;
        });
    }

    /**
     * Play a sound effect
     */
    playSFX(id: string): void {
        if (!this.sfxEnabled) return;

        const cached = this.sfxCache.get(id);
        if (cached) {
            // Clone to allow overlapping plays
            const clone = cached.cloneNode(true) as HTMLAudioElement;
            clone.volume = this.sfxVolume;
            clone.play().catch(() => {
                // Audio play may fail due to browser autoplay policy
            });
            return;
        }

        // If not cached, try to find in manifest and play directly
        const entry = this.manifest?.sfx?.find(s => s.id === id);
        if (entry) {
            const audio = new Audio(entry.file.startsWith('/') ? entry.file : `/${entry.file}`);
            audio.volume = this.sfxVolume;
            audio.play().catch(() => { });
        }
    }

    /**
     * Set SFX enabled/disabled
     */
    setSFXEnabled(enabled: boolean): void {
        this.sfxEnabled = enabled;
    }

    /**
     * Set SFX volume (0-1)
     */
    setSFXVolume(volume: number): void {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
    }

    /**
     * Check if SFX are available
     */
    hasSFX(): boolean {
        return this.sfxCache.size > 0;
    }

    // =========================================================================
    // Convenience methods for common SFX
    // =========================================================================

    playUIClick(): void {
        this.playSFX('ui_click_primary');
    }

    playCardPickup(): void {
        this.playSFX('card_pickup');
    }

    playCardDrop(): void {
        this.playSFX('card_drop_valid');
    }

    playCardDropInvalid(): void {
        this.playSFX('card_drop_invalid');
    }

    playDistrictClaim(): void {
        this.playSFX('district_claim');
    }

    playCrisisPlayed(): void {
        this.playSFX('crisis_played');
    }

    playCrisisConfirm(): void {
        this.playSFX('crisis_confirm');
    }
}

// Singleton export
export const AudioManager = new AudioManagerClass();
