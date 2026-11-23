# STREAM-002.7 — Authentication UI & Route Guards

## İçerik

- Mevcut `AuthForm` (Login/Register) kullanıcı deneyimi iyileştirildi: alan bazlı Zod doğrulaması, erişilebilir hata mesajları, bekleme durumu, şifre görünürlüğü, CSRF/auth hatalarına göre anlaşılır geri bildirim.
- Başarılı oturum açma sonrası güvenli yönlendirme geliştirildi. Login ↔ Register geçişlerinde `returnTo` korunur; `/login` veya `/register` döngülerinden kaçınılır.
- `ProtectedRoute` mevcut session bootstrap ve güvenli redirect davranışını korur.
- `apps/web/tests/auth-ui.test.ts` testleri ve `scripts/verify-stream-002-7.mjs` eklendi.
- API/Prisma/Worker değişmedi; yeni bağımlılık ve migration yok.

## Kurulum

Önce mevcut değişikliklerinizi Git ile kaydedin. ZIP dosyasını proje **kök klasöründe** açın:

```bash
unzip -n "$HOME/Downloads/StreamLab_STREAM-002.7_Auth_UI_Patch.zip" -d .
node apply-stream-002-7.mjs
```

Beklenen mesaj: `PASS: STREAM-002.7 installed safely (... files created/updated).`

Kurulum script'i tüm kontrollerini dosyaları yazmadan önce yapar. Tanımadığı eski dosya değişikliklerinde durur; kullanıcıya ait değişikliklerin otomatik birleşmesini denemez. Var olan dosyaların yedekleri repo dışında `../.streamlab-002-7-backups/<id>/` altında tutulur.

Kurulum başarılıysa:

```bash
rm -rf stream-002-7-payload apply-stream-002-7.mjs
pnpm format
pnpm verify:web:auth:ui
pnpm test:web:auth:ui
pnpm check
```

`pnpm test:web:auth:ui` shared contracts paketini derler, ardından tarayıcı gerektirmeyen validator/redirect/error-mapping testlerini çalıştırır. `pnpm check` tüm geçmiş regresyon kontrollerini de içerir.

## Tarayıcı kabul senaryoları

API ve Web uygulaması çalışırken (`pnpm dev:api`, `pnpm dev:web`):

1. Oturum yokken `/creator?tab=videos` → `/login?returnTo=%2Fcreator%3Ftab%3Dvideos` yönlendirmesi.
2. Login ekranından Register ekranına geçişte `returnTo` korunur.
3. Boş/geçersiz e-posta, kısa kayıt şifresi ve boş görüntü adı alan bazlı hata gösterir; ilk hatalı alana odaklanır.
4. Şifre görünür/gizli düğmesi çalışır; yanlış şifre mesajı hesap varlığını açığa çıkarmaz.
5. Başarılı giriş/kayıt sonrasında başlangıçtaki iç sayfaya gidilir, sayfa yenilense oturum korunur.
6. Login/Register'a kimlik doğrulamışken doğrudan gitme durumu bir döngüye yol açmaz.
7. Logout sonrasında `/creator` yeniden login'e yönlendirir.
8. Ekran klavye ve mobil genişliğinde kullanılabilir.

Bu tarayıcı senaryoları otomatik E2E testi değildir; otomatik UI/E2E kapsaması STREAM-002.9'da genişletilecek.

## Geri alma

Kurulumdan önce commit atıldıysa `git diff` üzerinden değişiklikleri inceleyip Git ile geri alabilirsiniz. Alternatif olarak kurulum mesajında yazan yedek dizinini kullanın.
