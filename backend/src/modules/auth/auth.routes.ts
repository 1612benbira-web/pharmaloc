import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticateAny } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { authController } from './auth.controller';
import { loginSchema, refreshSchema, registerCourierSchema, registerPharmacySchema, registerSchema } from './auth.validators';

export const authRoutes = Router();

authRoutes.post('/register', authLimiter, validate({ body: registerSchema }), asyncHandler(authController.register));
authRoutes.post('/register/pharmacy', authLimiter, validate({ body: registerPharmacySchema }), asyncHandler(authController.registerPharmacy));
authRoutes.post('/register/courier', authLimiter, validate({ body: registerCourierSchema }), asyncHandler(authController.registerCourier));
authRoutes.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(authController.login));
authRoutes.post('/refresh', authLimiter, validate({ body: refreshSchema }), asyncHandler(authController.refresh));
authRoutes.post('/logout', authenticateAny, asyncHandler(authController.logout));
authRoutes.get('/me', authenticateAny, asyncHandler(authController.me));
