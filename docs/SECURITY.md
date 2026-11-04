# Security checklist

## Перед production

- [ ] Точный канонический `TRUSTED_ORIGIN` без пути/слеша, HTTPS и проверенный CSP nonce. В production отсутствие origin-конфигурации блокирует login/mutations, а session cookie всегда `Secure`.
- [ ] Runtime DB role не может менять схему; migration role не используется приложением.
- [ ] До общего atomic rate limiter приложение запущено ровно одним Node-процессом (`WEB_CONCURRENCY=1`). Горизонтальное масштабирование запрещено проверкой конфигурации.
- [ ] Пароли хэшируются Argon2id; параметры проверены нагрузочным тестом на production-классе CPU.
- [ ] Session token хранится только в HttpOnly cookie, в БД — только hash; idle/absolute expiry проверены.
- [ ] Все admin mutations требуют session, server-side RBAC, CSRF, Origin и JSON content type.
- [ ] Operator получает `403` на каталог, цены, настройки, сотрудников, роли и изображения.
- [ ] Клиентская цена игнорируется; неизвестные/недоступные IDs отклоняются.
- [ ] Параллельные запросы с одним Idempotency-Key создают один заказ.
- [ ] Исторический заказ не меняется после редактирования/архивирования меню.
- [ ] Последовательный номер не открывает гостевой заказ и PII.
- [ ] Image upload проверяет magic bytes, MIME, размер и dimensions; SVG запрещён, metadata удаляется.
- [ ] Reverse proxy ограничивает всё тело multipart-запроса (приложение дополнительно проверяет `Content-Length`, но chunked body должен ограничиваться на proxy).
- [ ] В логах нет cookie, токенов, паролей, полного телефона/адреса и тела заказа.
- [ ] В client bundle и `NEXT_PUBLIC_*` нет DB/storage/session секретов.
- [ ] Production errors не содержат stack trace, SQL и внутренних путей.
- [ ] Backups шифруются; успешное восстановление проверено документированным restore drill.

## Известные границы локальной версии

- Bounded in-memory rate limit поддерживает только один процесс и блокирует `WEB_CONCURRENCY != 1`; перед горизонтальным масштабированием требуется shared atomic storage.
- Локальное файловое хранилище не является production upload pipeline.
- Без запущенного PostgreSQL нельзя считать DB-интеграционные сценарии проверенными.
