/**
 * Removes USFM inline markers while preserving their visible text. Footnotes,
 * cross-references and figures are editorial apparatus, not scripture, so they
 * are discarded rather than flattened into verse text.
 */
export function normalizeUsfmText(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n");

  text = text.replace(/\\(f|x|fig|ef|ex)\b[\s\S]*?\\\1\*/g, " ");
  text = text.replace(/\\\+?w\s+([\s\S]*?)\\\+?w\*/g, (_match, body: string) => {
    return body.split("|", 1)[0] ?? "";
  });
  text = text.replace(/\\\+?[a-z0-9]+\*?/g, "");

  return cleanText(text);
}

/** Collapses formatting whitespace without changing punctuation or quotation marks. */
export function cleanText(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex -- source files may contain C0 control bytes
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, " ")
      // eslint-disable-next-line no-control-regex -- remove pilcrows, SUB and zero-width padding
      .replace(/[\u00b6\u001a\ufeff\u200b\u200c\u200d]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}
