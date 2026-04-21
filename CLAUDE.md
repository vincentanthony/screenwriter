# Screenwriter — Project Context for Claude Code

## What this is
A lightweight, web-based screenwriting app. Local-first with planned cloud sync.
Built by a filmmaker, so UX and writing feel matter more than feature breadth.

## Architectural principles (non-negotiable)
- **Fountain is the source of truth.** The TipTap document is a view over parsed
  Fountain text. Never let them drift. Serialize to Fountain on every meaningful
  change (debounced) and persist the Fountain string.
- **Storage goes through a repository interface**, never Dexie directly from
  components. This is so cloud sync (likely Supabase) can be added later without
  rewriting callers.
- **AI features are v2.** Do not build them yet. But leave a stub `AIService`
  interface in place so v2 isn't a rewrite.
- **No true pagination engine in v1.** Visual page-break indicators based on
  line count are fine. Do not go down the WYSIWYG paged-layout rabbit hole.
- **Keyboard-first.** Every action reachable without a mouse. Command palette
  (Cmd+K) is a v1 feature.

## Performance budget
Editor must stay responsive at 30,000 words (roughly a feature film). Debounce
Fountain serialization. Avoid re-parsing the whole document on every keystroke.

## Stack
- Vite + React + TypeScript
- TipTap for the editor (custom nodes per screenplay element)
- fountain-js for parse/serialize
- Dexie.js for IndexedDB (behind repository interface)
- Tailwind + shadcn/ui

## v1 definition of done
I can write a short screenplay with proper element cycling (Tab/Enter), save it
locally, reopen it, and export a clean FDX file. Nothing more.

## Working style
- Propose a plan before writing code on non-trivial changes.
- Commit after each logical unit of work with clear messages.
- When unsure, ask. Don't guess at product decisions.
- Flag when you're about to do something that contradicts the principles above.