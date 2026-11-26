import { CategoryListResponseSchema, type Category } from '@streamlab/contracts';
import { findCategories } from '../repositories/category.repository.js';

export type CategoryListReader = () => Promise<Category[]>;
export type CategoryListHandler = () => Promise<{ items: Category[] }>;

export function createCategoryListService(
  read: CategoryListReader = findCategories,
): CategoryListHandler {
  return async () => CategoryListResponseSchema.parse({ items: await read() });
}

export const listCategories = createCategoryListService();
