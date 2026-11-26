import { CategoryListResponseSchema, type Category } from '@streamlab/contracts';
import { axiosInstance } from '@/lib/axios';

type Success<T> = { success: true; data: T };

export async function listPublicCategories(signal?: AbortSignal): Promise<Category[]> {
  const response = await axiosInstance.get<Success<unknown>>('/categories', { signal });
  return CategoryListResponseSchema.parse(response.data.data).items;
}
