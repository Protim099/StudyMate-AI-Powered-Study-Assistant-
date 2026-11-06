import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { ZodError } from "zod";
import { HttpError } from "./auth";
import { router } from "./routes";

for (const k of ["DATABASE_URL", "JWT_SECRET", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"]) {
  if (!process.env[k]) throw new Error(`Missing env var: ${k}`);
}

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/api", rateLimit({ windowMs: 60_000, limit: 120 }), router);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues[0]?.message ?? "Invalid input" });
  } else if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
  } else if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File too large (max 10MB)" : err.message });
  } else {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
