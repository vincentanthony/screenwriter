/**
 * XML entity escaping for FDX text content and attribute values.
 *
 * We escape all five "predefined entities" (&, <, >, ", ') for both
 * contexts. That's stricter than the spec requires — `&` and `<` are
 * the only mandatory escapes inside element content; quotes are
 * required only inside attributes — but escaping all five everywhere
 * costs nothing and removes a category of bugs where text crosses
 * from an element-content slot into an attribute slot.
 */

const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => XML_ENTITIES[c]);
}
