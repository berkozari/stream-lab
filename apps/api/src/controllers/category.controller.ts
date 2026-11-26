import type { RequestHandler } from 'express';
import { sendSuccess } from '../utils/api-response.js';
import { listCategories, type CategoryListHandler } from '../services/category.service.js';

export function createListCategoryController(
  handler: CategoryListHandler = listCategories,
): RequestHandler {
  return async (_req, res) => {
    const categories = await handler();
    res.set('Cache-Control', 'public, max-age=60');
    sendSuccess(res, categories);
  };
}
