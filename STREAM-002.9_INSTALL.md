# STREAM-002.9 — Authentication Integration & E2E Validation

## Kapsam

Bu paket mevcut authentication implementasyonunu **değiştirmez**. Playwright ile gerçek
React ↔ Express ↔ PostgreSQL akışları için uçtan uca test ekler.

- `playwright.config.ts`: Chromium, mevcut sunucuları kullanma veya gerektiğinde başlatma
- `apps/web/tests/e2e/auth-flow.spec.ts`: gerçek kullanıcı akışları
- `apps/api/scripts/auth-e2e-cleanup.ts`: yalnızca testin oluşturduğu `streamlab-e2e-<uuid>@example.invalid` hesabını silme
- `scripts/verify-stream-002-9.mjs`: altyapı ve komut doğrulaması
- `package.json`: `@playwright/test` ve E2E komutları
- `.gitignore`: Playwright sonuçlarını Git dışında tutma

## 1. Hazırlık

Önce kodunu Git'e kaydet. Ardından ZIP'i proje kökünde aç:

```bash
unzip -n "$HOME/Downloads/StreamLab_STREAM-002.9_Auth_E2E_Patch.zip" -d .
node apply-stream-002-9.mjs
```

Başarılı kurulum sonrası:

```bash
rm -rf stream-002-9-payload
rm apply-stream-002-9.mjs
pnpm install
pnpm exec playwright install chromium
pnpm format
```

`pnpm install` sonrasında üretilen `pnpm-lock.yaml` dosyasını Git'e ekle.
Yeni **npm bağımlılığı** `@playwright/test`'tir; Prisma migration gerekmez.

## 2. Mevcut kontroller

```bash
pnpm verify:auth:e2e
pnpm check
```

`pnpm check` tarayıcı testlerini çalıştırmaz. Bu bilinçli bir tercihtir: normal
TypeScript, lint, unit ve build sürecinin PostgreSQL ve Chromium'a bağımlı
olmamasını sağlar.

## 3. Gerçek E2E testleri

Docker altyapısı ve `.env` hazır olmalı. PostgreSQL migration'ları önceden
uygulanmış olmalı. Üretim veritabanında çalıştırma.

```bash
bash scripts/infra-up.sh
pnpm db:migrate:status
pnpm test:auth:e2e
```

Playwright, varsayılan olarak `127.0.0.1:4000` API ve `127.0.0.1:5173` Web
sunucularını bulursa kullanır; yoksa kendisi başlatır. API yeniden başlatma
yarışını önlemek için bu komut `contracts` paketini tekrar derlemez; öncesinde
`pnpm check` ile workspace build edilmiş olmalıdır.

Tarayıcı testleri aşağıdakileri doğrular:

1. Yetkisiz `/creator?tab=uploads` erişimi ve güvenli `returnTo`
2. Register → Creator ve HttpOnly refresh cookie
3. Reload sonrası session bootstrap ve logout
4. Kayıtta alan bazlı validasyon, geçersiz POST'un engellenmesi
5. Hatalı parola mesajı, ardından doğru parola ile login
6. İki bağımsız tarayıcı oturumundan birinin logout olması

Test sırasında oluşturulan kullanıcılar `afterEach` ile veritabanından temizlenir;
yalnızca öngörülen `streamlab-e2e-<uuid>@example.invalid` biçimi temizlenebilir.
Test süreci zorla kapatılırsa cleanup çalışamayabilir. Böyle bir durumda
`streamlab-e2e-` ile başlayan test kullanıcılarını kontrol et.

## 4. Hata ayıklama

```bash
pnpm exec playwright test --config=playwright.config.ts --headed
pnpm exec playwright show-report
```

- `Executable doesn't exist`: `pnpm exec playwright install chromium`
- `ECONNREFUSED`: `127.0.0.1:4000` ve `127.0.0.1:5173` erişimini kontrol et
- `Prisma` migration hatası: `pnpm db:migrate:status`
- Bir test başarısızsa `test-results/` içindeki trace ve screenshot kullanılabilir

## Kabul kriteri

`pnpm verify:auth:e2e`, `pnpm check` ve `pnpm test:auth:e2e` başarılı.
Ardından STREAM-002 Authentication milestone'u tamamlanabilir.
