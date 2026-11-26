import { Router } from 'express';
import { createListCategoryController } from '../controllers/category.controller.js';
import type { CategoryListHandler } from '../services/category.service.js';

export function createCategoryRouter(list?: CategoryListHandler): Router {
  const router = Router();
  router.get('/', createListCategoryController(list));
  return router;
}
