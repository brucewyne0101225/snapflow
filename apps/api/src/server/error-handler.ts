import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      res.status(409).json({ error: "Resource already exists" });
      return;
    }
  }

  if (error instanceof MulterError) {
    res.status(400).json({
      error: error.code === "LIMIT_FILE_SIZE" ? "Selfie is too large (max 10MB)." : error.message
    });
    return;
  }

  console.error("Unhandled API error", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown error"
  });

  res.status(500).json({ error: "Internal server error" });
};
