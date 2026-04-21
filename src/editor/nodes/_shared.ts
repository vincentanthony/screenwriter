import { mergeAttributes, type NodeConfig } from '@tiptap/core';
import { NODE_HTML, type NodeName } from '@/editor/serialization/nodeNames';

/**
 * Build a `parseHTML` rule that matches `<p data-sw="<value>">` for a given
 * screenplay node. Using `data-sw` as the discriminator (rather than the
 * CSS class) avoids classname-collision ambiguity and keeps our nodes
 * identifiable even if styling changes.
 */
export function dataSwTag(nodeName: NodeName, tag: string = 'p'): NonNullable<NodeConfig['parseHTML']> {
  const { data } = NODE_HTML[nodeName];
  return () => [{ tag: `${tag}[data-sw="${data}"]` }];
}

/**
 * Build a `renderHTML` function that emits `<tag data-sw="..." class="...">`
 * with any TipTap-computed attrs merged in. Block-level nodes use the
 * content hole `0`.
 */
export function renderAsDataSw(nodeName: NodeName, tag: string = 'p'): NonNullable<NodeConfig['renderHTML']> {
  const { data, className } = NODE_HTML[nodeName];
  return ({ HTMLAttributes }) => [
    tag,
    mergeAttributes({ 'data-sw': data, class: className }, HTMLAttributes),
    0,
  ];
}

/**
 * For leaf/atom nodes (pageBreak) that have no content hole.
 */
export function renderAsDataSwAtom(nodeName: NodeName, tag: string): NonNullable<NodeConfig['renderHTML']> {
  const { data, className } = NODE_HTML[nodeName];
  return ({ HTMLAttributes }) => [
    tag,
    mergeAttributes({ 'data-sw': data, class: className }, HTMLAttributes),
  ];
}

/**
 * Standard `forced` boolean attribute, stored on the DOM as `data-forced`
 * so round-tripping through innerHTML preserves it. Omitted from the DOM
 * when false to keep output clean.
 */
export const forcedAttr = {
  default: false,
  parseHTML: (el: HTMLElement) => el.getAttribute('data-forced') === 'true',
  renderHTML: (attrs: { forced?: boolean }) =>
    attrs.forced ? { 'data-forced': 'true' } : {},
};

/**
 * Standard `dual` boolean attribute (for dual-dialogue Character nodes).
 */
export const dualAttr = {
  default: false,
  parseHTML: (el: HTMLElement) => el.getAttribute('data-dual') === 'true',
  renderHTML: (attrs: { dual?: boolean }) =>
    attrs.dual ? { 'data-dual': 'true' } : {},
};
