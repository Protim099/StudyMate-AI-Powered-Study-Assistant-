import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ timeout: 60_000 });
const model = process.env.ANTHROPIC_MODEL as string;

export const CHAT_SYSTEM =
  "You are StudyMate, a study assistant. Answer ONLY using the provided document excerpts. " +
  "Cite chunk numbers like [Chunk 3] when useful. If the answer is not in the excerpts, reply exactly: " +
  "\"I couldn't find this in your document.\"";

export const TASK_SYSTEM =
  "You are StudyMate. Use only the provided document content. Do not invent facts.";

export async function complete(system: string, user: string, maxTokens = 1500): Promise<string> {
  const r = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

export async function streamChat(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  onText: (t: string) => void
): Promise<string> {
  const s = client.messages.stream({ model, max_tokens: 1200, system, messages });
  s.on("text", onText);
  return s.finalText();
}
