import type { RequestHandler } from 'express';
import type { RegisterRequest, LoginRequest } from '@streamlab/contracts';
import { issueCsrfContext, writeRefreshCookie } from '../lib/auth-cookies.js';
import {
  registerUser,
  loginUser,
  type RegisterHandler,
  type LoginHandler,
} from '../services/auth.service.js';
import { sendSuccess } from '../utils/api-response.js';

export const getCsrfController: RequestHandler = (_req, res) => {
  res.set('Cache-Control', 'no-store');
  sendSuccess(res, { csrfToken: issueCsrfContext(res) });
};

export function createRegisterController(register: RegisterHandler = registerUser): RequestHandler {
  return async (req, res) => {
    const result = await register(req.body as RegisterRequest);
    writeRefreshCookie(res, result.refreshToken);
    // A new browser context invalidates the pre-auth CSRF token. Bootstrap again after signup.
    issueCsrfContext(res);
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, result.response, 201);
  };
}

export function createLoginController(login: LoginHandler = loginUser): RequestHandler {
  return async (req, res) => {
    const result = await login(req.body as LoginRequest);
    writeRefreshCookie(res, result.refreshToken);
    issueCsrfContext(res);
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, result.response, 200);
  };
}
