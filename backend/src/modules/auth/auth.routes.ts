import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { authController } from './auth.controller';
import { loginSchema, refreshSchema, registerSchema } from './auth.validators';

export const authRoutes = Router();

authRoutes.post('/register', authLimiter, validate({ body: registerSchema }), asyncHandler(authController.register));
authRoutes.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(authController.login));
authRoutes.post('/refresh', authLimiter, validate({ body: refreshSchema }), asyncHandler(authController.refresh));
authRoutes.post('/logout', authenticate, asyncHandler(authController.logout));
authRoutes.get('/me', authenticate, asyncHandler(authController.me));
