export function chunkText(
  text: string,
  maxChars = 3000,
  overlapChars = 350,
): string[] {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .trim();
  if (!normalized) return [];
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (
        let offset = 0;
        offset < paragraph.length;
        offset += maxChars - overlapChars
      )
        chunks.push(paragraph.slice(offset, offset + maxChars));
      continue;
    }
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current);
      const overlap = current.slice(-overlapChars);
      current =
        overlap.length + paragraph.length + 2 <= maxChars
          ? `${overlap}\n\n${paragraph}`
          : paragraph;
    } else current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}
export function lexicalScore(question: string, content: string) {
  const terms = question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  if (!terms.length) return 0;
  const lower = content.toLowerCase();
  const unique = [...new Set(terms)];
  const matches = unique.filter((term) => lower.includes(term)).length;
  return matches / unique.length;
}
