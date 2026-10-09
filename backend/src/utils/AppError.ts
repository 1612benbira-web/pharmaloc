export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message = 'Requête invalide', details?: unknown) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentification requise') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'Accès interdit') {
    return new AppError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Ressource introuvable') {
    return new AppError(404, 'NOT_FOUND', message);
  }
  static conflict(message = 'Conflit', details?: unknown) {
    return new AppError(409, 'CONFLICT', message, details);
  }
  static tooMany(message = 'Trop de tentatives') {
    return new AppError(429, 'TOO_MANY_REQUESTS', message);
  }
  static validation(details: unknown, message = 'Données invalides') {
    return new AppError(422, 'VALIDATION_ERROR', message, details);
  }
}
