import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Every domain error the API raises deliberately (as opposed to an unexpected exception)
 * goes through this class, so the response body always has the shape:
 *   { error: { code, message, details? } }
 * `code` is the thing the frontend should branch on — never parse `message`.
 */
export class AppError extends HttpException {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    super({ error: { code, message, details } }, status);
    this.code = code;
    this.details = details;
  }
}

export class InsufficientStockError extends AppError {
  constructor(productId: string, requested: number, available: number) {
    super(
      'INSUFFICIENT_STOCK',
      'Not enough stock to complete this sale.',
      HttpStatus.CONFLICT,
      { productId, requested, available },
    );
  }
}

export class DiscountAlreadyUsedError extends AppError {
  constructor(discountId: string) {
    super(
      'DISCOUNT_ALREADY_USED',
      'That discount was already applied to another sale.',
      HttpStatus.CONFLICT,
      { discountId },
    );
  }
}

export class DiscountNotApplicableError extends AppError {
  constructor(discountId: string, clientId: string | undefined) {
    super(
      'DISCOUNT_NOT_APPLICABLE',
      'That discount does not belong to this client.',
      HttpStatus.BAD_REQUEST,
      { discountId, clientId },
    );
  }
}

export class RefundExceedsSoldError extends AppError {
  constructor(productId: string, requested: number, remaining: number) {
    super(
      'REFUND_EXCEEDS_SOLD',
      'Cannot refund more than was sold and not already refunded.',
      HttpStatus.BAD_REQUEST,
      { productId, requested, remaining },
    );
  }
}

export class NotFoundAppError extends AppError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} not found.`, HttpStatus.NOT_FOUND, { entity, id });
  }
}

export class ClientHasPetsError extends AppError {
  constructor(clientId: string) {
    super(
      'CLIENT_HAS_PETS',
      'This client still has pets linked — unlink or remove them first.',
      HttpStatus.CONFLICT,
      { clientId },
    );
  }
}

export class InvalidPinError extends AppError {
  constructor() {
    super('INVALID_PIN', 'Incorrect employee or PIN.', HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenAppError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }
}

export class ValidationAppError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, HttpStatus.BAD_REQUEST, details);
  }
}

export class SlotUnavailableError extends AppError {
  constructor(requestedAt: string) {
    super(
      'SLOT_UNAVAILABLE',
      'That time has just been taken. Please choose another slot.',
      HttpStatus.CONFLICT,
      { requestedAt },
    );
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests. Please try again in a minute.') {
    super('TOO_MANY_REQUESTS', message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class IdempotencyConflictError extends AppError {
  constructor(key: string) {
    super(
      'IDEMPOTENCY_KEY_REPLAYED_CONCURRENTLY',
      'This request is already being processed. Retry shortly.',
      HttpStatus.CONFLICT,
      { key },
    );
  }
}
