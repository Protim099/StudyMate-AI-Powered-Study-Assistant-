import { Router, RequestHandler, Request, Response } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import { z } from "zod";
import { prisma } from "./db";
import { HttpError, requireAuth, setCookie, sign } from "./auth";
import { chunkText, retrieve, sample } from "./text";
import { CHAT_SYSTEM, TASK_SYSTEM, complete, streamChat } from "./ai";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (b: Buffer) => Promise<{ text: string }>;

export const router = Router();

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

const param = (req: Request, k: string) => String(req.params[k]);

async function ownDoc(userId: string, id: string) {
  const d = await prisma.document.findFirst({ where: { id, userId } });
  if (!d) throw new HttpError(404, "Document not found");
  return d;
}

/* ---------- Auth ---------- */
const email = z.string().email().toLowerCase();
const password = z.string().min(8, "Password must be at least 8 characters").max(100);

router.post("/auth/register", h(async (req, res) => {
  const body = z.object({ name: z.string().min(1).max(60), email, password }).parse(req.body);
  if (await prisma.user.findUnique({ where: { email: body.email } }))
    throw new HttpError(409, "Email already registered");
  const u = await prisma.user.create({
    data: { ...body, password: await bcrypt.hash(body.password, 12) },
  });
  setCookie(res, sign(u.id));
  res.status(201).json({ id: u.id, name: u.name, email: u.email });
}));

router.post("/auth/login", h(async (req, res) => {
  const body = z.object({ email, password: z.string() }).parse(req.body);
  const u = await prisma.user.findUnique({ where: { email: body.email } });
  if (!u || !(await bcrypt.compare(body.password, u.password)))
    throw new HttpError(401, "Invalid email or password");
  setCookie(res, sign(u.id));
  res.json({ id: u.id, name: u.name, email: u.email });
}));

router.post("/auth/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, h(async (req, res) => {
  const u = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, name: true, email: true },
  });
  if (!u) throw new HttpError(401, "Unauthorized");
  res.json(u);
}));

/* ---------- Documents ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_r, f, cb) => cb(null, f.mimetype === "application/pdf"),
});

router.get("/documents", requireAuth, h(async (req, res) => {
  res.json(
    await prisma.document.findMany({
      where: { userId: req.userId },
      select: { id: true, title: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    })
  );
}));

router.post("/documents", requireAuth, upload.single("file"), h(async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, "Please upload a PDF file (max 10MB)");
  if (file.buffer.subarray(0, 4).toString() !== "%PDF") throw new HttpError(400, "Invalid PDF file");
  const parsed = await pdfParse(file.buffer);
  const text = parsed.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 50) throw new HttpError(422, "No readable text found (scanned PDFs are not supported)");
  const doc = await prisma.document.create({
    data: {
      userId: req.userId,
      title: file.originalname.replace(/\.pdf$/i, "").slice(0, 120),
      chunks: { create: chunkText(text).map((content, index) => ({ index, content })) },
    },
    select: { id: true, title: true, createdAt: true },
  });
  res.status(201).json(doc);
}));

router.get("/documents/:id", requireAuth, h(async (req, res) => {
  const d = await ownDoc(req.userId, param(req, "id"));
  res.json({ id: d.id, title: d.title });
}));

router.delete("/documents/:id", requireAuth, h(async (req, res) => {
  const d = await ownDoc(req.userId, param(req, "id"));
  await prisma.document.delete({ where: { id: d.id } });
  res.json({ ok: true });
}));

/* ---------- Chat (SSE streaming) ---------- */
router.get("/documents/:id/messages", requireAuth, h(async (req, res) => {
  const d = await ownDoc(req.userId, param(req, "id"));
  res.json(
    await prisma.chatMessage.findMany({
      where: { documentId: d.id },
      select: { role: true, content: true, sources: true },
      orderBy: { createdAt: "asc" },
    })
  );
}));

router.post("/documents/:id/chat", requireAuth, h(async (req, res) => {
  const { question } = z.object({ question: z.string().min(1).max(1000) }).parse(req.body);
  const doc = await ownDoc(req.userId, param(req, "id"));
  const chunks = await prisma.documentChunk.findMany({ where: { documentId: doc.id } });
  const top = retrieve(chunks, question, 5);
  const history = (
    await prisma.chatMessage.findMany({
      where: { documentId: doc.id },
      orderBy: { createdAt: "desc" },
      take: 6,
    })
  ).reverse();
  while (history[0]?.role === "assistant") history.shift();
  await prisma.chatMessage.create({ data: { documentId: doc.id, role: "user", content: question } });

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (o: object) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  const sources = top.map((c) => c.index + 1);
  send({ sources });
  try {
    const context = top.map((c) => `[Chunk ${c.index + 1}]\n${c.content}`).join("\n\n");
    const answer = await streamChat(
      CHAT_SYSTEM,
      [
        ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: `Document excerpts:\n${context}\n\nQuestion: ${question}` },
      ],
      (t) => send({ t })
    );
    await prisma.chatMessage.create({
      data: { documentId: doc.id, role: "assistant", content: answer, sources },
    });
  } catch (e) {
    console.error("AI error:", e instanceof Error ? e.message : e);
    send({ error: "AI request failed. Please try again." });
  }
  res.end();
}));

/* ---------- Summary ---------- */
const summaryPrompts = {
  short: "Write a short summary (4-6 sentences).",
  detailed: "Write a detailed, well-structured summary with clear section headings.",
  bullets: "List the 8-12 most important key points as concise bullet points.",
};

router.post("/documents/:id/summary", requireAuth, h(async (req, res) => {
  const { type } = z.object({ type: z.enum(["short", "detailed", "bullets"]) }).parse(req.body);
  const doc = await ownDoc(req.userId, param(req, "id"));
  const chunks = await prisma.documentChunk.findMany({ where: { documentId: doc.id }, orderBy: { index: "asc" } });
  const summary = await complete(TASK_SYSTEM, `${summaryPrompts[type]}\n\nDocument:\n${sample(chunks)}`);
  res.json({ summary });
}));

/* ---------- Quiz ---------- */
const questionsSchema = z.array(
  z.object({
    question: z.string(),
    options: z.array(z.string()).length(4),
    answer: z.number().int().min(0).max(3),
    explanation: z.string(),
  })
);

router.post("/documents/:id/quiz", requireAuth, h(async (req, res) => {
  const { count } = z.object({ count: z.number().int().min(3).max(15).default(5) }).parse(req.body);
  const doc = await ownDoc(req.userId, param(req, "id"));
  const chunks = await prisma.documentChunk.findMany({ where: { documentId: doc.id }, orderBy: { index: "asc" } });
  const raw = await complete(
    TASK_SYSTEM,
    `Create ${count} multiple-choice questions from the document. Return ONLY a JSON array, no other text. ` +
      `Each item: {"question": string, "options": [4 strings], "answer": index 0-3 of the correct option, "explanation": string}.\n\nDocument:\n${sample(chunks)}`,
    3000
  );
  let questions;
  try {
    questions = questionsSchema.parse(JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1)));
  } catch {
    throw new HttpError(502, "AI returned an invalid quiz. Please try again.");
  }
  const quiz = await prisma.quiz.create({ data: { documentId: doc.id, questions } });
  res.status(201).json({
    id: quiz.id,
    questions: questions.map(({ question, options }) => ({ question, options })),
  });
}));

router.post("/quizzes/:id/attempt", requireAuth, h(async (req, res) => {
  const { answers } = z.object({ answers: z.array(z.number().int()).max(20) }).parse(req.body);
  const quiz = await prisma.quiz.findFirst({
    where: { id: param(req, "id"), document: { userId: req.userId } },
  });
  if (!quiz) throw new HttpError(404, "Quiz not found");
  const qs = questionsSchema.parse(quiz.questions);
  const score = qs.filter((q, i) => answers[i] === q.answer).length;
  await prisma.quizAttempt.create({ data: { quizId: quiz.id, userId: req.userId, score, total: qs.length } });
  res.json({ score, total: qs.length, results: qs.map((q) => ({ answer: q.answer, explanation: q.explanation })) });
}));

/* ---------- Dashboard ---------- */
router.get("/dashboard", requireAuth, h(async (req, res) => {
  const [documents, messages, attempts] = await Promise.all([
    prisma.document.count({ where: { userId: req.userId } }),
    prisma.chatMessage.count({ where: { document: { userId: req.userId }, role: "user" } }),
    prisma.quizAttempt.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { quiz: { select: { document: { select: { title: true } } } } },
    }),
  ]);
  res.json({
    documents,
    messages,
    attempts: attempts.map((a) => ({
      id: a.id, score: a.score, total: a.total, createdAt: a.createdAt, title: a.quiz.document.title,
    })),
  });
}));
