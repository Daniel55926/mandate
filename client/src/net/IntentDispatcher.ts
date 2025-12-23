/**
 * Client IntentDispatcher
 * Handles client_intent_id generation and pending intent tracking
 * 
 * Rules:
 * - Every intent has a unique client_intent_id
 * - Track pending intents until ACK received
 * - Support retry with same client_intent_id for idempotency
 */

import type { IntentType, AckMessage, ReasonCode } from '@mandate/shared';

export interface PendingIntent {
    intentId: string;
    type: IntentType;
    payload: Record<string, unknown>;
    timestamp: number;
    retryCount: number;
    onAccepted?: () => void;
    onRejected?: (reason: ReasonCode, details?: string) => void;
}

export class IntentDispatcher {
    private intentCounter = 0;
    private sessionId: string;
    private pendingIntents: Map<string, PendingIntent> = new Map();
    private maxRetries = 3;
    private retryTimeoutMs = 5000;

    constructor() {
        // Generate a unique session ID for this connection
        this.sessionId = `c${Date.now().toString(36)}`;
    }

    /**
     * Create a new intent with unique client_intent_id
     */
    createIntent(
        type: IntentType,
        payload: Record<string, unknown> = {},
        callbacks?: {
            onAccepted?: () => void;
            onRejected?: (reason: ReasonCode, details?: string) => void;
        }
    ): { intentId: string; message: object } {
        const intentId = `${this.sessionId}-${String(++this.intentCounter).padStart(6, '0')}`;

        const pending: PendingIntent = {
            intentId,
            type,
            payload,
            timestamp: Date.now(),
            retryCount: 0,
            onAccepted: callbacks?.onAccepted,
            onRejected: callbacks?.onRejected,
        };
        this.pendingIntents.set(intentId, pending);

        return {
            intentId,
            message: {
                protocol_version: '0.1',
                op: 'INTENT',
                type,
                client_intent_id: intentId,
                payload,
            },
        };
    }

    /**
     * Handle ACK message from server
     */
    handleAck(ack: AckMessage): boolean {
        const pending = this.pendingIntents.get(ack.client_intent_id);
        if (!pending) {
            console.log(`[IntentDispatcher] Received ACK for unknown intent: ${ack.client_intent_id}`);
            return false;
        }

        this.pendingIntents.delete(ack.client_intent_id);

        if (ack.type === 'INTENT_ACCEPTED') {
            console.log(`[IntentDispatcher] Intent accepted: ${pending.type}`);
            pending.onAccepted?.();
        } else {
            const reason = ack.payload.reason_code as ReasonCode;
            const details = ack.payload.details as string | undefined;
            console.log(`[IntentDispatcher] Intent rejected: ${pending.type} - ${reason}`);
            pending.onRejected?.(reason, details);
        }

        return true;
    }

    /**
     * Get pending intent for retry
     */
    getPendingIntent(intentId: string): PendingIntent | undefined {
        return this.pendingIntents.get(intentId);
    }

    /**
     * Check if an intent is pending
     */
    hasPendingIntent(intentId: string): boolean {
        return this.pendingIntents.has(intentId);
    }

    /**
     * Get all pending intents (for reconnect replay)
     */
    getAllPending(): PendingIntent[] {
        return Array.from(this.pendingIntents.values());
    }

    /**
     * Mark intent as timed out
     */
    checkTimeouts(): PendingIntent[] {
        const now = Date.now();
        const timedOut: PendingIntent[] = [];

        for (const [intentId, pending] of this.pendingIntents) {
            if (now - pending.timestamp > this.retryTimeoutMs) {
                if (pending.retryCount >= this.maxRetries) {
                    timedOut.push(pending);
                    this.pendingIntents.delete(intentId);
                } else {
                    pending.retryCount++;
                    pending.timestamp = now;
                }
            }
        }

        return timedOut;
    }

    /**
     * Clear all pending intents
     */
    clear(): void {
        this.pendingIntents.clear();
    }

    /**
     * Reset for new connection
     */
    reset(): void {
        this.intentCounter = 0;
        this.sessionId = `c${Date.now().toString(36)}`;
        this.pendingIntents.clear();
    }
}
