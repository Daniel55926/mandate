/**
 * Client EventSequencer
 * Handles event_seq ordering and buffering per 05_networking_protocol.md
 * 
 * Rules:
 * - Apply only events with event_seq == last_event_seq + 1
 * - Buffer future events until missing ones are received
 * - Request snapshot if a gap persists
 */

import type { EventMessage, SnapshotMessage } from '@mandate/shared';

export type EventHandler = (event: EventMessage) => void;
export type SnapshotHandler = (snapshot: SnapshotMessage) => void;
export type GapHandler = (lastSeq: number, receivedSeq: number) => void;

export class EventSequencer {
    private lastEventSeq = 0;
    private buffer: Map<number, EventMessage> = new Map();
    private eventHandler: EventHandler;
    private snapshotHandler: SnapshotHandler;
    private gapHandler: GapHandler;
    // Gap threshold config (may be used in future)
    private gapTimeout: ReturnType<typeof setTimeout> | null = null;
    private gapTimeoutMs = 2000; // Wait 2s before requesting snapshot

    constructor(
        eventHandler: EventHandler,
        snapshotHandler: SnapshotHandler,
        gapHandler: GapHandler
    ) {
        this.eventHandler = eventHandler;
        this.snapshotHandler = snapshotHandler;
        this.gapHandler = gapHandler;
    }

    /**
     * Process an incoming event message
     */
    processEvent(event: EventMessage): void {
        const seq = event.event_seq;

        // HELLO_OK uses seq 0, special case
        if (event.type === 'HELLO_OK' && seq === 0) {
            this.eventHandler(event);
            return;
        }

        // Private events may use the current seq (not incremented)
        // These bypass the sequencing check since they're player-specific
        if (event.type === 'HAND_SNAPSHOT' || event.type === 'HAND_DELTA') {
            this.eventHandler(event);
            return;
        }

        // Expected next event
        if (seq === this.lastEventSeq + 1) {
            this.applyEvent(event);
            this.flushBuffer();
            this.clearGapTimeout();
        }
        // Future event - buffer it
        else if (seq > this.lastEventSeq + 1) {
            this.buffer.set(seq, event);
            console.log(`[EventSequencer] Buffered event ${seq}, waiting for ${this.lastEventSeq + 1}`);
            this.startGapTimeout();
        }
        // Past event - ignore (already applied or duplicate)
        else {
            console.log(`[EventSequencer] Ignoring past event ${seq} (last: ${this.lastEventSeq})`);
        }
    }

    /**
     * Process a snapshot message (resets sequencer state)
     */
    processSnapshot(snapshot: SnapshotMessage): void {
        this.lastEventSeq = snapshot.event_seq;
        this.buffer.clear();
        this.clearGapTimeout();
        this.snapshotHandler(snapshot);
        console.log(`[EventSequencer] Snapshot applied, seq now ${this.lastEventSeq}`);
    }

    /**
     * Get current sequence number
     */
    getLastEventSeq(): number {
        return this.lastEventSeq;
    }

    /**
     * Reset sequencer state
     */
    reset(): void {
        this.lastEventSeq = 0;
        this.buffer.clear();
        this.clearGapTimeout();
    }

    // ==========================================================================
    // Private
    // ==========================================================================

    private applyEvent(event: EventMessage): void {
        this.lastEventSeq = event.event_seq;
        this.eventHandler(event);
    }

    private flushBuffer(): void {
        // Apply buffered events in order
        while (this.buffer.has(this.lastEventSeq + 1)) {
            const next = this.buffer.get(this.lastEventSeq + 1)!;
            this.buffer.delete(this.lastEventSeq + 1);
            this.applyEvent(next);
        }
    }

    private startGapTimeout(): void {
        if (this.gapTimeout) return;

        this.gapTimeout = setTimeout(() => {
            if (this.buffer.size > 0) {
                const minBuffered = Math.min(...this.buffer.keys());
                const gap = minBuffered - this.lastEventSeq - 1;

                if (gap > 0) {
                    console.log(`[EventSequencer] Gap detected: missing ${gap} events`);
                    this.gapHandler(this.lastEventSeq, minBuffered);
                }
            }
            this.gapTimeout = null;
        }, this.gapTimeoutMs);
    }

    private clearGapTimeout(): void {
        if (this.gapTimeout) {
            clearTimeout(this.gapTimeout);
            this.gapTimeout = null;
        }
    }
}
