import { RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const secret = process.env.JWT_SECRET as string;

export const sign = (id: string) => jwt.sign({ id }, secret, { expiresIn: "7d" });

export const setCookie = (res: Response, token: string) =>
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 3600 * 1000,
  });

export const requireAuth: RequestHandler = (req, _res, next) => {
  try {
    const payload = jwt.verify(req.cookies.token ?? "", secret) as { id: string };
    req.userId = payload.id;
    next();
  } catch {
    next(new HttpError(401, "Unauthorized"));
  }
};
