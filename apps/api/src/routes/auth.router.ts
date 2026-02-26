import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { signAccessToken } from "../auth/jwt.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../server/async-handler.js";

const signupSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128)
});

const loginSchema = signupSchema;

function sanitizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function serializeUser(user: { id: string; email: string; role: string }) {
  return {
    id: user.id,
    email: user.email,
    role: user.role
  };
}

export const authRouter = Router();

authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const input = signupSchema.parse(req.body);
    const email = sanitizeEmail(input.email);

    try {
      const passwordHash = await bcrypt.hash(input.password, 12);
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash
        }
      });

      const token = signAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role
      });

      res.status(201).json({
        token,
        user: serializeUser(user)
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ error: "Email already registered" });
        return;
      }

      throw error;
    }
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const email = sanitizeEmail(input.email);

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user?.passwordHash) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const isValid = await bcrypt.compare(input.password, user.passwordHash);

    if (!isValid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    res.json({
      token,
      user: serializeUser(user)
    });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.authUser?.sub;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true
      }
    });

    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.json({ user: serializeUser(user) });
  })
);
