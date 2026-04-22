import type { ScreenplayElement } from '@/fountain/types';
import { escapeXml } from './escape';

/**
 * Emit the FDX `<Content>` block (script body) from our
 * ScreenplayElement[] plus a precomputed map of originalIndex →
 * page number (from paginate()'s Page[]).
 *
 * Two structural transformations happen here:
 *
 *   1. Dual dialogue grouping. When we see a Character with
 *      `dual: true`, FD wants the previous Character + following
 *      lines AND the dual Character + following lines wrapped in
 *      a `<DualDialogue>` element nested inside an outer
 *      `<Paragraph>`. We pre-scan into "segments" so emission knows
 *      what's part of a dual group and what isn't.
 *
 *   2. Forced page breaks. Our ScreenplayElement[] models `===` as
 *      an explicit `page-break` element. FDX has no standalone page-
 *      break paragraph — instead, the paragraph FOLLOWING a forced
 *      break carries `StartsNewPage="Yes"`. We track a pending flag
 *      while walking and apply it to the next emitted paragraph.
 *
 * Element type → FDX Paragraph Type mapping:
 *
 *   | Our type      | FDX Type        | Notes                              |
 *   |---------------|-----------------|------------------------------------|
 *   | scene         | Scene Heading   | + <SceneProperties Number/Page/…>  |
 *   | action        | Action          |                                    |
 *   | character     | Character       | dual=true triggers grouping        |
 *   | parenthetical | Parenthetical   |                                    |
 *   | dialogue      | Dialogue        |                                    |
 *   | transition    | Transition      |                                    |
 *   | centered      | Action          | Alignment="Center"                 |
 *   | section       | General         | (FD has no Section type)           |
 *   | synopsis      | (skipped)       | Fountain-specific; no FD analog    |
 *   | note          | (skipped)       | TODO: emit as <ScriptNote>         |
 *   | boneyard      | (skipped)       | Comments — never exported          |
 *   | lyric         | Action          | TODO: italic styling               |
 *   | page-break    | (consumed)      | Sets StartsNewPage on next paragraph|
 *   | title-page    | (handled elsewhere) — never reaches body emitter   |
 *
 * VERIFY against Final Draft (flagged for follow-up):
 *   - DualDialogue wrapper shape (the outer `<Paragraph>` may want a
 *     specific Type or no Type at all).
 *   - Section / synopsis / note / lyric mappings — none of these have
 *     stable FDX analogs and the right answer probably depends on
 *     what FD does with the `General` type and its script-note
 *     extension elements.
 *   - SceneProperties Length attribute — we emit "0"; FD typically
 *     stores eighths-of-a-page (e.g. "3/8"). FD usually recomputes
 *     Length when it opens a file, so "0" should be safe.
 *   - Multi-line text inside a single paragraph: we emit literal
 *     `\n` characters in the <Text>. FD may want multiple <Text>
 *     children separated by line breaks instead.
 */

export interface EmitBodyContext {
  pageOf: (originalIndex: number) => number;
}

interface PageBreakState {
  pending: boolean;
}

export function emitBody(
  elements: ScreenplayElement[],
  ctx: EmitBodyContext,
): string {
  const segments = groupSegments(elements);
  const sceneCounter = { value: 0 };
  const pageBreak: PageBreakState = { pending: false };

  const paragraphs: string[] = [];
  for (const segment of segments) {
    if (segment.kind === 'page-break') {
      pageBreak.pending = true;
      continue;
    }
    if (segment.kind === 'dual-dialogue') {
      paragraphs.push(emitDualDialogue(segment, ctx, sceneCounter, pageBreak));
      continue;
    }
    if (segment.kind === 'standalone') {
      const xml = emitStandalone(segment, ctx, sceneCounter, pageBreak);
      if (xml) paragraphs.push(xml);
      continue;
    }
  }

  return `<Content>
${paragraphs.join('\n')}
</Content>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Segment grouping
// ──────────────────────────────────────────────────────────────────────────

type CharacterElement = Extract<ScreenplayElement, { type: 'character' }>;

type Segment =
  | { kind: 'standalone'; element: ScreenplayElement; index: number }
  | { kind: 'page-break' }
  | {
      kind: 'dual-dialogue';
      first: { character: CharacterElement; rest: ScreenplayElement[]; firstIndex: number };
      second: { character: CharacterElement; rest: ScreenplayElement[]; secondIndex: number };
    };

/**
 * Walk elements once and bucket them into segments. The only
 * non-trivial case is dual dialogue: when we see a Character with
 * dual=true, we look BACK to find the most recent Character (the
 * first speaker) and forward to consume the rest of the dual block.
 */
function groupSegments(elements: ScreenplayElement[]): Segment[] {
  const segments: Segment[] = [];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];

    if (el.type === 'title-page') continue; // never in body
    if (el.type === 'boneyard') continue;
    if (el.type === 'synopsis') continue;
    if (el.type === 'note') continue;

    if (el.type === 'page-break') {
      segments.push({ kind: 'page-break' });
      continue;
    }

    // Dual-dialogue grouping: this element is the SECOND character of
    // a pair. Reach back into the segments we've already emitted to
    // find the first speaker's group.
    if (el.type === 'character' && el.dual) {
      const firstGroup = popPrecedingDialogueGroup(segments);
      if (firstGroup) {
        const secondRest = consumeDialogueGroupRest(elements, i + 1);
        segments.push({
          kind: 'dual-dialogue',
          first: firstGroup,
          second: {
            character: el,
            rest: secondRest.rest,
            secondIndex: i,
          },
        });
        i = secondRest.lastIndex;
        continue;
      }
      // No preceding dialogue group — emit as standalone Character.
    }

    segments.push({ kind: 'standalone', element: el, index: i });
  }

  return segments;
}

/**
 * Pop the trailing Character + (Parenthetical|Dialogue)* sequence off
 * `segments` so it can be wrapped in a DualDialogue. Returns null
 * (and leaves segments untouched) if the trailing run isn't a
 * dialogue group.
 */
function popPrecedingDialogueGroup(
  segments: Segment[],
): { character: CharacterElement; rest: ScreenplayElement[]; firstIndex: number } | null {
  const trail: { element: ScreenplayElement; index: number }[] = [];
  while (segments.length > 0) {
    const last = segments[segments.length - 1];
    if (last.kind !== 'standalone') break;
    const t = last.element.type;
    if (t === 'parenthetical' || t === 'dialogue') {
      trail.push({ element: last.element, index: last.index });
      segments.pop();
      continue;
    }
    if (t === 'character') {
      const character = last.element as CharacterElement;
      const charIdx = last.index;
      segments.pop();
      // We collected trail in reverse order; reverse to restore source order.
      const rest = trail.reverse().map((t) => t.element);
      return { character, rest, firstIndex: charIdx };
    }
    break;
  }

  // Couldn't form a group — restore what we popped (if anything).
  for (let i = trail.length - 1; i >= 0; i--) {
    segments.push({ kind: 'standalone', element: trail[i].element, index: trail[i].index });
  }
  return null;
}

function consumeDialogueGroupRest(
  elements: ScreenplayElement[],
  startIdx: number,
): { rest: ScreenplayElement[]; lastIndex: number } {
  const rest: ScreenplayElement[] = [];
  let i = startIdx;
  while (i < elements.length) {
    const el = elements[i];
    if (el.type === 'parenthetical' || el.type === 'dialogue') {
      rest.push(el);
      i++;
      continue;
    }
    break;
  }
  return { rest, lastIndex: i - 1 };
}

// ──────────────────────────────────────────────────────────────────────────
// Emission
// ──────────────────────────────────────────────────────────────────────────

function emitStandalone(
  segment: Extract<Segment, { kind: 'standalone' }>,
  ctx: EmitBodyContext,
  sceneCounter: { value: number },
  pageBreak: PageBreakState,
): string | null {
  const { element, index } = segment;
  const startsNewPage = pageBreak.pending;
  pageBreak.pending = false;
  const startsNewPageAttr = startsNewPage ? ' StartsNewPage="Yes"' : '';

  switch (element.type) {
    case 'scene': {
      sceneCounter.value += 1;
      const sceneNumber = sceneCounter.value;
      const page = ctx.pageOf(index);
      // SceneProperties Length="0" — FD recomputes scene length when it
      // opens the file, so "0" is a safe placeholder. SceneArcBeats
      // empty-element kept inside because some FD versions expect it.
      return `<Paragraph Type="Scene Heading"${startsNewPageAttr}>
<SceneProperties Length="0" Page="${page}" Title="" Number="${sceneNumber}">
<SceneArcBeats></SceneArcBeats>
</SceneProperties>
${textElement(element.text)}
</Paragraph>`;
    }
    case 'action':
      return paragraph('Action', element.text, startsNewPageAttr);
    case 'character':
      return paragraph('Character', element.text, startsNewPageAttr);
    case 'parenthetical':
      // FD wraps parentheticals in literal parens; our model strips
      // them on parse and re-adds on serialize. For FDX we re-add too.
      return paragraph('Parenthetical', `(${element.text})`, startsNewPageAttr);
    case 'dialogue':
      return paragraph('Dialogue', element.text, startsNewPageAttr);
    case 'transition':
      return paragraph('Transition', element.text, startsNewPageAttr);
    case 'centered':
      return paragraphWithAlign('Action', element.text, 'Center', startsNewPageAttr);
    case 'section':
      // FD has no Section type; "General" is a reasonable bucket for
      // organizational text that isn't part of the scene flow.
      return paragraph('General', element.text, startsNewPageAttr);
    case 'lyric':
      // TODO: emit italics. For v1, plain Action.
      return paragraph('Action', element.text, startsNewPageAttr);
    default:
      // boneyard / synopsis / note / title-page filtered earlier.
      return null;
  }
}

function emitDualDialogue(
  segment: Extract<Segment, { kind: 'dual-dialogue' }>,
  _ctx: EmitBodyContext,
  _sceneCounter: { value: number },
  pageBreak: PageBreakState,
): string {
  const startsNewPage = pageBreak.pending;
  pageBreak.pending = false;
  const startsNewPageAttr = startsNewPage ? ' StartsNewPage="Yes"' : '';

  const innerFirst = [
    paragraph('Character', segment.first.character.text, ''),
    ...segment.first.rest.map((r) => emitDialogueChild(r)),
  ].join('\n');

  const innerSecond = [
    paragraph('Character', segment.second.character.text, ''),
    ...segment.second.rest.map((r) => emitDialogueChild(r)),
  ].join('\n');

  return `<Paragraph${startsNewPageAttr}>
<DualDialogue>
${innerFirst}
${innerSecond}
</DualDialogue>
</Paragraph>`;
}

function emitDialogueChild(element: ScreenplayElement): string {
  if (element.type === 'parenthetical') return paragraph('Parenthetical', `(${element.text})`, '');
  if (element.type === 'dialogue') return paragraph('Dialogue', element.text, '');
  // Defensive: shouldn't reach here given consumeDialogueGroupRest.
  return '';
}

function paragraph(type: string, text: string, startsNewPageAttr: string): string {
  return `<Paragraph Type="${type}"${startsNewPageAttr}>
${textElement(text)}
</Paragraph>`;
}

function paragraphWithAlign(
  type: string,
  text: string,
  alignment: 'Left' | 'Center' | 'Right',
  startsNewPageAttr: string,
): string {
  return `<Paragraph Type="${type}" Alignment="${alignment}"${startsNewPageAttr}>
${textElement(text)}
</Paragraph>`;
}

function textElement(text: string): string {
  return `<Text>${escapeXml(text)}</Text>`;
}
