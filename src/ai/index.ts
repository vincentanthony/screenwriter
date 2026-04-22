/**
 * Public entry point for the AI layer.
 *
 * Application code imports from `@/ai` — never from a concrete
 * provider file — so swapping providers is a one-line change here.
 *
 * ⚠️ The currently-active provider (Anthropic direct-to-browser) is
 * dev-only. See src/ai/anthropic.ts for the warning and the plan
 * for the backend-proxy replacement.
 */

export type { AIProvider } from './provider';
export { AIError } from './types';
export type { AIErrorKind, AIResponse, Message } from './types';
export { USAGE_RECORDED_EVENT } from './anthropic';

import { anthropicProvider } from './anthropic';
import type { AIProvider } from './provider';

export const provider: AIProvider = anthropicProvider;
