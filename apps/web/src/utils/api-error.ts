import axios from 'axios';

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) return 'Oturum gerekli.';
    if (error.response?.status === 403) return 'Bu işlem için yetkin yok.';
    if (error.code === 'ECONNABORTED') return 'İstek zaman aşımına uğradı.';
    return 'API isteği başarısız oldu.';
  }
  return error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.';
}
