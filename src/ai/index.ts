/**
 * Public entry point for the AI layer.
 *
 * Application code imports from `@/ai` — never from
 * `@/ai/openaiCodex` directly — so swapping providers later is a
 * one-file change in this barrel file.
 */

export type { AIProvider } from './provider';
export { AIError } from './types';
export type { AIErrorKind, AIResponse, Message } from './types';

import { openaiCodexProvider } from './openaiCodex';
import type { AIProvider } from './provider';

/**
 * The active AI provider. For now there's exactly one choice; when a
 * second provider lands, this becomes a selection (likely driven by
 * a user setting in localStorage).
 */
export const provider: AIProvider = openaiCodexProvider;
