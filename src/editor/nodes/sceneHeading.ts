import { Node } from '@tiptap/core';
import { NODE_NAMES } from '@/editor/serialization/nodeNames';
import { dataSwTag, forcedAttr, renderAsDataSw } from './_shared';

/**
 * Scene Heading — the slugline at the top of every scene.
 * Natural sceneheadings start with INT./EXT./EST./I/E.; forced ones with `.`.
 * Text casing is handled by the serializer (non-forced → uppercase) and by
 * CSS `text-transform: uppercase` for visual consistency while typing.
 */
export const SceneHeading = Node.create({
  name: NODE_NAMES.sceneHeading,
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return { forced: forcedAttr };
  },

  parseHTML: dataSwTag(NODE_NAMES.sceneHeading),
  renderHTML: renderAsDataSw(NODE_NAMES.sceneHeading),
});
