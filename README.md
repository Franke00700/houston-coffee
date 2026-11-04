# Houston Coffee

Полноценный сайт кофейни на Next.js и PostgreSQL: брендовая публичная часть, меню, конфигуратор, корзина, гостевой заказ и защищённая административная часть.

Проект развивает исходный `Houston_Coffee_Showroom.html`: сохранены логотип, палитра, изображения и идея интерактивных стаканов. Цены, контакты и часы исходника считаются демонстрационными и не публикуются как подтверждённые данные.

## Возможности

- Главная Houston Coffee со скролл-сценой, свайпом, приготовлением, отменой/повтором, reduced motion и статичным fallback.
- Категории, товары, варианты объёма, молока и добавок.
- Корзина и серверный пересчёт цены перед заказом.
- Гостевой checkout, самовывоз и отключаемая доставка.
- Идемпотентное создание заказа с номером и историческими снимками позиций/цен.
- Вход сотрудников, роли `ADMIN` и `OPERATOR`, очередь заказов и state machine статусов.
- Управление каталогом, наличием и настройками; append-only аудит важных действий.

## Локальный запуск

Требования: Node.js 24.11+, pnpm 11+, PostgreSQL 18 (или совместимая поддерживаемая версия).

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm admin:create
pnpm dev
```

Команда создания администратора интерактивно запрашивает пароль; не передавайте пароль в аргументах или истории shell. Если скрипт поддерживает переменную окружения для автоматизации, передавайте её только через временный secret store CI и удаляйте после запуска.

Откройте `http://localhost:3000`; вход сотрудников — `/admin/login`.

## Переменные окружения

Скопируйте `.env.example` в `.env` и замените все `change-me`. Никогда не коммитьте `.env`.

- `DATABASE_URL` — runtime-подключение least-privilege пользователя.
- `DIRECT_URL` — прямое подключение владельца схемы для миграций.
- `SESSION_COOKIE_SECURE=true` — обязательно за HTTPS.
- `TRUSTED_ORIGIN` — точный публичный origin без завершающего `/`.
- `WEB_CONCURRENCY=1` — обязательное ограничение до реализации общего atomic rate limiter.
- `ORDER_RATE_LIMIT` — лимит попыток публичного заказа за 10 минут; default `10`.
- `UPLOAD_DIR` — только локальная разработка; production требует изолированное object storage.

## Проверки

```powershell
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Полная Windows-проверка настоящего PostgreSQL выполняется `pnpm test:postgres`. Скрипт ищет portable PostgreSQL в `.test/postgresql/pgsql/bin`; для workspace с не-ASCII путём задайте ASCII-пути `HOUSTON_PG_BIN` и `HOUSTON_TEST_STATE_ROOT`. Browser matrix запускается `pnpm test:e2e` против production-сборки и HTTPS origin. Unit-тесты БД не требуют.

## Развёртывание

1. Подготовьте PostgreSQL, отдельные роли migration/runtime и TLS.
2. Сохраните секреты в secret manager; клиентские `NEXT_PUBLIC_*` не должны содержать секретов.
3. Примените миграции отдельным release job: `pnpm db:migrate`.
4. Соберите `pnpm build`, запустите `pnpm start` за HTTPS reverse proxy.
5. Укажите `TRUSTED_ORIGIN`, включите secure cookie и настройте доверие к proxy-заголовкам только от своего proxy.
6. Запускайте ровно один Node-процесс; горизонтальное масштабирование запрещено до реализации общего atomic rate limiter.
7. Изолируйте и перекодируйте загружаемые изображения до включения production uploads.
8. Создайте первого администратора через одноразовую release/ops-команду.

HSTS включайте на proxy только после проверки HTTPS на всех нужных поддоменах. Платежи, внешние сообщения и публикация сайта намеренно не настроены.

## Резервное копирование и восстановление

Пример логического backup (пароль передавайте через безопасный механизм PostgreSQL, не в командной строке):

```powershell
pg_dump --format=custom --no-owner --file houston-YYYYMMDD.dump $env:DATABASE_URL
```

Восстановление выполняйте в новую пустую БД, не поверх production:

```powershell
createdb houston_restore_test
pg_restore --no-owner --clean --if-exists --dbname houston_restore_test houston-YYYYMMDD.dump
```

После восстановления примените миграции, проверьте количество заказов, сотрудников, настроек и audit-записей, затем выполните тестовый вход и quote. Шифруйте backups, ограничивайте доступ, задайте retention и регулярно проводите restore drill. Файлы object storage резервируются отдельно с согласованной точкой восстановления.

## Документация

- [`docs/AUDIT.md`](docs/AUDIT.md) — аудит исходника и демонстрационных данных.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — границы, роли и инварианты.
- [`docs/API.md`](docs/API.md) — публичные и административные контракты.
- [`docs/SECURITY.md`](docs/SECURITY.md) — модель угроз и production checklist.
- Локальные отчёты и browser-артефакты не публикуются в репозитории, чтобы не раскрывать пути рабочей станции и тестовые данные.
