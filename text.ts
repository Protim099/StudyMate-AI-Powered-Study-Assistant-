export function chunkText(text: string, size = 1000, overlap = 150): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size - overlap) {
    out.push(text.slice(i, i + size));
    if (i + size >= text.length) break;
  }
  return out;
}

interface Chunk { index: number; content: string }

// Simple keyword scoring (upgrade path: PostgreSQL full-text search or pgvector)
export function retrieve<T extends Chunk>(chunks: T[], question: string, k = 5): T[] {
  const terms = question.toLowerCase().match(/[a-z0-9\u0980-\u09ff]{3,}/g) ?? [];
  const scored = chunks.map((c) => {
    const lower = c.content.toLowerCase();
    return { c, score: terms.reduce((s, t) => s + lower.split(t).length - 1, 0) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((x) => x.c).sort((a, b) => a.index - b.index);
}

// Evenly sample chunks across the document up to ~maxChars
export function sample(chunks: Chunk[], maxChars = 12000): string {
  const per = Math.max(1, Math.floor(maxChars / (chunks[0]?.content.length || 1000)));
  if (chunks.length <= per) return chunks.map((c) => c.content).join("\n");
  const picked = Array.from({ length: per }, (_, i) => chunks[Math.floor((i * chunks.length) / per)]);
  return picked.map((c) => c.content).join("\n");
}
