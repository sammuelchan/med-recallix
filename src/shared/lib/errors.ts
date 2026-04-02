export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON() {
    return {
      success: false,
      error: this.message,
      code: this.code,
    };
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "未授权，请先登录") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "资源") {
    super(`${resource}不存在`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "数据冲突") {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
}
