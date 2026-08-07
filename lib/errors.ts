export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export function handleApiError(error: unknown): {
  message: string;
  statusCode: number;
  code?: string;
} {
  if (error instanceof AppError) {
    return {
      message: error.message,
      statusCode: error.statusCode,
      code: error.code,
    };
  }

  const prismaCode =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: string }).code === "string"
      ? (error as { code: string }).code
      : null;

  const errorName =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: string }).name)
      : "";

  if (
    errorName === "PrismaClientInitializationError" ||
    prismaCode === "P1001" ||
    prismaCode === "P1017"
  ) {
    return {
      message:
        "The database is not available right now. Start Docker Desktop, then run: docker compose up -d postgres redis",
      statusCode: 503,
      code: "DATABASE_UNAVAILABLE",
    };
  }

  if (prismaCode === "P2002") {
    const target =
      error &&
      typeof error === "object" &&
      "meta" in error &&
      error.meta &&
      typeof error.meta === "object" &&
      "target" in error.meta &&
      Array.isArray((error.meta as { target?: string[] }).target)
        ? (error.meta as { target: string[] }).target
        : [];

    if (target.includes("email")) {
      return {
        message:
          "This email is already registered. Sign in instead or use a different email address.",
        statusCode: 409,
        code: "EMAIL_ALREADY_REGISTERED",
      };
    }

    if (target.includes("phone")) {
      return {
        message: "This phone number is already linked to another account.",
        statusCode: 409,
        code: "PHONE_ALREADY_REGISTERED",
      };
    }
  }

  if (prismaCode === "P2021" || prismaCode === "P2022") {
    return {
      message:
        "The database schema is out of date. In the backend project folder, run: npm run db:push",
      statusCode: 503,
      code: "SCHEMA_MISMATCH",
    };
  }

  console.error("Unhandled error:", error);

  if (process.env.NODE_ENV !== "production") {
    const devMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "";
    if (devMessage.trim()) {
      return {
        message: devMessage,
        statusCode: 500,
        code: "INTERNAL_ERROR",
      };
    }
  }

  return {
    message: "Something went wrong on our end. Please try again in a moment.",
    statusCode: 500,
    code: "INTERNAL_ERROR",
  };
}
