import { LoginRequestSchema, RegisterRequestSchema } from '@streamlab/contracts';

export type AuthMode = 'login' | 'register';
export type AuthFieldName = 'email' | 'password' | 'displayName';
export type AuthFields = Readonly<{ email: string; password: string; displayName: string }>;
export type AuthFieldErrors = Partial<Record<AuthFieldName, string>>;

const friendlyMessages: Record<AuthFieldName, string> = {
  email: 'Geçerli bir e-posta adresi gir.',
  password: 'Geçerli bir şifre gir.',
  displayName: 'Görünen adını gir.',
};

/** The API contract is the single source of truth; messages are a UI concern. */
export function validateAuthFields(mode: AuthMode, fields: AuthFields): AuthFieldErrors {
  const data = {
    email: fields.email.trim(),
    password: fields.password,
    displayName: fields.displayName.trim(),
  };
  const result =
    mode === 'login' ? LoginRequestSchema.safeParse(data) : RegisterRequestSchema.safeParse(data);
  if (result.success) return {};

  const errors: AuthFieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (key !== 'email' && key !== 'password' && key !== 'displayName') continue;
    if (errors[key]) continue;
    if (key === 'password' && mode === 'register') {
      errors.password = 'Şifre 12–128 karakter arasında olmalı.';
    } else if (key === 'displayName' && data.displayName.length > 100) {
      errors.displayName = 'Görünen ad en fazla 100 karakter olabilir.';
    } else if (key === 'email' && data.email.length > 255) {
      errors.email = 'E-posta en fazla 255 karakter olabilir.';
    } else {
      errors[key] = friendlyMessages[key];
    }
  }
  return errors;
}

export function authSubmitErrorMessage(mode: AuthMode, status?: number, code?: string): string {
  if (code === 'INVALID_CREDENTIALS') return 'E-posta veya şifre hatalı.';
  if (mode === 'register' && (code === 'EMAIL_ALREADY_EXISTS' || status === 409)) {
    return 'Bu e-posta adresi zaten kayıtlı.';
  }
  if (status === 429) return 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.';
  if (status === 403) return 'Güvenlik doğrulaması başarısız. Sayfayı yenileyip tekrar dene.';
  if (status === undefined) return 'Sunucuya bağlanılamadı. İnternet bağlantını kontrol et.';
  return 'İşlem tamamlanamadı. Lütfen tekrar dene.';
}
