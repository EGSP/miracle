# Bootstrap пакета `back-nest`

> Эта инструкция применяется **один раз** — при первичном создании пакета.
> После того как `back-nest/` существует и работает, агенты пользуются `module.md`, `controller.md` и др.

## Когда применять

Когда в корне репы нет каталога `back-nest/` или его `src/main.ts`.

## Контекст

`back-nest` — новый workspace-пакет в монорепе, NestJS-эквивалент существующего `back/`. Раскладка повторяет принципы соседних пакетов (`back/`, `tools/`): TypeScript NodeNext-ESM, `tsx` для dev, `tsc` для build, `npm` workspaces.

После выполнения этой инструкции должно работать:

- `curl http://localhost:<PORT>/health` → `{"status":"ok"}`
- `curl http://localhost:<PORT>/users/me` без cookies → 401
- `curl http://localhost:<PORT>/users/me -H "Cookie: accessToken=<JWT>"` (валидный токен) → JSON пользователя

## Шаг 1 — добавить workspace в корневой `package.json`

Открыть `package.json` в корне репы, в массив `workspaces` добавить `"back-nest"`. Итоговый массив:

```json
"workspaces": [
  "aramid",
  "back",
  "back-nest",
  "front",
  "tools",
  "types"
]
```

Больше ничего в корневом `package.json` не трогать.

## Шаг 2 — создать каркас каталогов

```
back-nest/
  package.json
  tsconfig.json
  nest-cli.json
  src/
    load-env.ts
    main.ts
    app.module.ts
    config/
      env.schema.ts
      app-config.module.ts
      app-config.service.ts
    database/
      json-collection.ts
      collections.ts
      database.module.ts
      database.service.ts
    tokens/
      tokens.service.ts
      tokens.module.ts
    auth/
      auth.guard.ts
      current-user.decorator.ts
      auth.module.ts
    health/
      health.controller.ts
      health.module.ts
    users/
      users.controller.ts
      users.service.ts
      users.module.ts
```

## Шаг 3 — `back-nest/package.json` (минимальный, до установки)

```json
{
  "name": "@miracle/back-nest",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "dev:debug": "tsx watch --inspect=9230 src/main.ts",
    "build": "tsc",
    "start": "node dist/main.js"
  }
}
```

Никаких зависимостей вручную не вписываем — установятся следующим шагом.

## Шаг 4 — `back-nest/tsconfig.json`

Повторяет `back/tsconfig.json` плюс декораторы для Nest:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

## Шаг 5 — `back-nest/nest-cli.json`

Минимальный — нужен только если кто-то захочет генерить файлы через `nest g`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

## Шаг 6 — установка зависимостей

**Принцип:** ни в `package.json`, ни в этой инструкции не пишутся фиксированные версии вручную. Каждая команда использует `@latest`, npm резолвит актуальные мажоры на момент установки и фиксирует их как `^x.y.z` в `package.json`.

Выполнить **из каталога `back-nest/`**:

```bash
# Runtime
npm install @nestjs/core@latest @nestjs/common@latest @nestjs/platform-fastify@latest
npm install @nestjs/config@latest reflect-metadata@latest rxjs@latest
npm install fastify@latest @fastify/cookie@latest
npm install zod@latest nestjs-zod@latest
npm install jose@latest lowdb@latest ts-deepmerge@latest dotenv@latest
npm install @miracle/types

# Dev
npm install -D typescript@latest tsx@latest @types/node@latest
npm install -D @nestjs/cli@latest @nestjs/testing@latest
```

После установки **проверить** `back-nest/package.json` — в нём не должно быть строки `"latest"` ни в одной зависимости, только конкретные семвер-диапазоны.

**Сознательно НЕ ставим:**

- `class-validator`, `class-transformer` — заменяет `nestjs-zod`
- `@nestjs/jwt` — заменяет `jose` (как в текущем `back`)
- `@nestjs/terminus` — health-чек пока тривиальный
- `@nestjs/swagger` — кодген клиента вне текущей фазы
- `winston` — на старте достаточно встроенного `Logger`
- `cookie-parser`, `cors`, `express` — Fastify-стек этого не требует

## Шаг 7 — содержимое файлов

### `src/load-env.ts`

```ts
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });
```

### `src/main.ts`

```ts
import './load-env.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.service.js';

async function bootstrap() {
    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter(),
    );

    await app.register(fastifyCookie);

    const config = app.get(AppConfigService);

    app.enableCors({
        origin: config.corsOpen ? true : config.corsOrigins,
        credentials: true,
    });

    app.useGlobalPipes(new ZodValidationPipe());

    await app.listen(config.port, '0.0.0.0');
    console.log(`[back-nest] http://localhost:${config.port}`);
}

bootstrap().catch((err) => {
    console.error('[back-nest] failed to bootstrap', err);
    process.exit(1);
});
```

### `src/app.module.ts`

```ts
import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
    imports: [
        AppConfigModule,
        DatabaseModule,
        AuthModule,
        HealthModule,
        UsersModule,
    ],
})
export class AppModule {}
```

### `src/config/env.schema.ts`

```ts
import { z } from 'zod';

export const envSchema = z.object({
    PORT: z.coerce.number().default(3001),
    CORS_OPEN: z.coerce.boolean().default(false),
    CORS_ORIGIN: z.string().default('http://localhost:8081'),
    ACCESS_TOKEN_LIFETIME: z.string().default('15m'),
    REFRESH_TOKEN_LIFETIME: z.string().default('7d'),
    /**
     * Дефолты повторяют back/src/config.ts — нужны для совместимости с уже выпущенными
     * cookies на dev-окружении. В production обязательно перекрыть через .env.
     */
    ACCESS_TOKEN_SECRET: z.string().min(1).default('access_token_secret'),
    REFRESH_TOKEN_SECRET: z.string().min(1).default('refresh_token_secret'),
    DB_DIR: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;
```

### `src/config/app-config.module.ts`

```ts
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './env.schema.js';
import { AppConfigService } from './app-config.service.js';

@Global()
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validate: (raw) => envSchema.parse(raw),
        }),
    ],
    providers: [AppConfigService],
    exports: [AppConfigService],
})
export class AppConfigModule {}
```

### `src/config/app-config.service.ts`

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from './env.schema.js';

@Injectable()
export class AppConfigService {
    constructor(private readonly config: ConfigService<EnvConfig, true>) {}

    get port(): number {
        return this.config.get('PORT', { infer: true });
    }

    get corsOpen(): boolean {
        return this.config.get('CORS_OPEN', { infer: true });
    }

    get corsOrigins(): string[] {
        return this.config.get('CORS_ORIGIN', { infer: true })
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }

    get accessTokenSecret(): string {
        return this.config.get('ACCESS_TOKEN_SECRET', { infer: true });
    }

    get refreshTokenSecret(): string {
        return this.config.get('REFRESH_TOKEN_SECRET', { infer: true });
    }

    get accessTokenLifetime(): string {
        return this.config.get('ACCESS_TOKEN_LIFETIME', { infer: true });
    }

    get refreshTokenLifetime(): string {
        return this.config.get('REFRESH_TOKEN_LIFETIME', { infer: true });
    }

    get dbDir(): string | undefined {
        return this.config.get('DB_DIR', { infer: true });
    }
}
```

### `src/database/json-collection.ts`

Скопировано из `back/src/databases/db.ts` с одним изменением — `DB_DIR` больше не модульная константа, а параметр в `JsonCollection.create(name, dbDir, middlewares?)`. Регистрация коллекций (`registerDb`, `DbRegistry`) **не переносится** — в Nest это делает `database/collections.ts` + DI.

```ts
import { mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import type { DbEntity } from '@miracle/types';
import { merge } from 'ts-deepmerge';

export type JsonDb<TData extends object> = Low<TData>;

export type StoredEntity<TItem extends object> =
    TItem extends object ? Omit<TItem, keyof DbEntity> & DbEntity : never;

export type CreateEntityInput<TItem extends object> =
    TItem extends object ? Omit<TItem, keyof DbEntity> & Partial<Pick<DbEntity, 'id'>> : never;

export type UpdateEntityInput<TItem extends object> =
    TItem extends object ? Partial<Omit<TItem, keyof DbEntity>> : never;

export type CollectionData<TItem extends object> = {
    items: StoredEntity<TItem>[];
};

export type CollectionMiddleware<TItem extends object> = {
    beforeCreate?: (item: StoredEntity<TItem>) => void;
    beforeUpdate?: (item: StoredEntity<TItem>, patch: UpdateEntityInput<TItem>) => void;
    beforeSoftDelete?: (item: StoredEntity<TItem>, mark: boolean) => void;
};

const timestampsMiddleware: CollectionMiddleware<object> = {
    beforeCreate(item) {
        const now = Date.now();
        item.createdAt = now;
        item.updatedAt = now;
    },
    beforeUpdate(item) {
        item.updatedAt = Date.now();
    },
    beforeSoftDelete(item, mark) {
        item.deletedAt = mark ? Date.now() : null;
        item.updatedAt = Date.now();
    },
};

function getDbFilePath(dbDir: string, name: string): string {
    const fileName = name.endsWith('.json') ? name : `${name}.json`;
    return path.join(dbDir, fileName);
}

async function createJsonDb<TData extends object>(
    dbDir: string,
    name: string,
    defaultData: TData,
): Promise<JsonDb<TData>> {
    await mkdir(dbDir, { recursive: true });
    const adapter = new JSONFile<TData>(getDbFilePath(dbDir, name));
    const db = new Low(adapter, defaultData);
    await db.read();
    await db.write();
    return db;
}

export class JsonCollection<TItem extends object> {
    private constructor(
        private readonly db: JsonDb<CollectionData<TItem>>,
        private readonly middlewares: CollectionMiddleware<TItem>[],
    ) {}

    static async create<TItem extends object>(
        name: string,
        dbDir: string,
        middlewares: CollectionMiddleware<TItem>[] = [],
    ): Promise<JsonCollection<TItem>> {
        const db = await createJsonDb<CollectionData<TItem>>(dbDir, name, { items: [] });
        return new JsonCollection<TItem>(db, [
            timestampsMiddleware as CollectionMiddleware<TItem>,
            ...middlewares,
        ]);
    }

    ref(): StoredEntity<TItem>[] {
        return this.db.data.items;
    }

    list(): StoredEntity<TItem>[] {
        return structuredClone(this.db.data.items);
    }

    getById(id: string): StoredEntity<TItem> | undefined {
        const item = this.getItemById(id);
        return item ? structuredClone(item) : undefined;
    }

    async create(input: CreateEntityInput<TItem>): Promise<StoredEntity<TItem>> {
        const item = {
            ...input,
            id: input.id ?? randomUUID(),
            createdAt: 0,
            updatedAt: 0,
        } as StoredEntity<TItem>;

        this.middlewares.forEach((m) => m.beforeCreate?.(item));
        this.db.data.items.push(item);
        await this.db.write();
        return structuredClone(item);
    }

    async update(id: string, patch: UpdateEntityInput<TItem>): Promise<StoredEntity<TItem> | undefined> {
        const item = this.getItemById(id);
        if (!item) return undefined;
        Object.assign(item, merge.withOptions({ mergeArrays: false }, item, patch));
        this.middlewares.forEach((m) => m.beforeUpdate?.(item, patch));
        await this.db.write();
        return structuredClone(item);
    }

    async softDelete(id: string, mark: boolean): Promise<StoredEntity<TItem> | undefined> {
        const item = this.getItemById(id);
        if (!item) return undefined;
        this.middlewares.forEach((m) => m.beforeSoftDelete?.(item, mark));
        await this.db.write();
        return structuredClone(item);
    }

    async delete(id: string): Promise<boolean> {
        const idx = this.db.data.items.findIndex((item) => item.id === id);
        if (idx === -1) return false;
        this.db.data.items.splice(idx, 1);
        await this.db.write();
        return true;
    }

    private getItemById(id: string): StoredEntity<TItem> | undefined {
        return this.db.data.items.find((item) => item.id === id);
    }
}
```

### `src/database/collections.ts`

Центральное объявление коллекций. На старте только `users` — остальные добавляются по мере миграции доменов (правило в `database.md`).

```ts
import type { User } from '@miracle/types';
import { JsonCollection } from './json-collection.js';

/**
 * Внутренняя форма пользователя — то, что лежит в БД (с полем password).
 * Публичные эндпоинты должны возвращать User без password (см. users.service.ts).
 */
export type UserInternal = User & { password: string };

export async function createCollections(dbDir: string) {
    return {
        users: await JsonCollection.create<UserInternal>('users', dbDir),
    } as const;
}

export type Collections = Awaited<ReturnType<typeof createCollections>>;
```

### `src/database/database.service.ts`

```ts
import { Injectable, type OnModuleInit } from '@nestjs/common';
import path from 'path';
import { mkdir } from 'fs/promises';
import { AppConfigService } from '../config/app-config.service.js';
import { createCollections, type Collections } from './collections.js';

@Injectable()
export class DatabaseService implements OnModuleInit {
    collections!: Collections;

    constructor(private readonly config: AppConfigService) {}

    async onModuleInit(): Promise<void> {
        const dir = this.config.dbDir
            ? path.resolve(this.config.dbDir)
            : path.resolve(process.cwd(), 'data');

        await mkdir(dir, { recursive: true });
        this.collections = await createCollections(dir);
    }
}
```

### `src/database/database.module.ts`

```ts
import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

@Global()
@Module({
    providers: [DatabaseService],
    exports: [DatabaseService],
})
export class DatabaseModule {}
```

### `src/tokens/tokens.service.ts`

`tokens/` — отдельный модуль (а не файл внутри `auth/`): `TokensService` нужен и `AuthGuard`, и auth-флоу (login/refresh), поэтому он живёт самостоятельно и его импортируют через `TokensModule`. Это одна из немногих не-доменных папок (см. принцип №1 в `README.md`).

```ts
import { Injectable } from '@nestjs/common';
import { jwtVerify, errors } from 'jose';
import type { JwtPayload } from '@miracle/types';
import { AppConfigService } from '../config/app-config.service.js';

export type VerifyResult = JwtPayload | 'expired' | 'invalid';

@Injectable()
export class TokensService {
    constructor(private readonly config: AppConfigService) {}

    async verifyAccessToken(token: string | undefined): Promise<VerifyResult> {
        if (!token) return 'invalid';
        try {
            const secret = new TextEncoder().encode(this.config.accessTokenSecret);
            const result = await jwtVerify(token, secret);
            return result.payload as JwtPayload;
        } catch (error) {
            if (error instanceof errors.JWTExpired) return 'expired';
            return 'invalid';
        }
    }
}
```

### `src/tokens/tokens.module.ts`

```ts
import { Module } from '@nestjs/common';
import { TokensService } from './tokens.service.js';

@Module({
    providers: [TokensService],
    exports: [TokensService],
})
export class TokensModule {}
```

### `src/auth/auth.guard.ts`

```ts
import {
    CanActivate,
    type ExecutionContext,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { TokensService } from '../tokens/tokens.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedUser } from './current-user.decorator.js';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly tokens: TokensService,
        private readonly db: DatabaseService,
    ) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const req = ctx.switchToHttp().getRequest<FastifyRequest>();
        const accessToken = req.cookies?.accessToken;

        const payload = await this.tokens.verifyAccessToken(accessToken);
        if (payload === 'expired') throw new UnauthorizedException('Access token expired');
        if (payload === 'invalid') throw new UnauthorizedException('Access token invalid');

        const user = this.db.collections.users.getById(payload.sub);
        if (!user) throw new NotFoundException('User not found');

        const { password: _password, ...publicUser } = user;
        (req as FastifyRequest & { user?: AuthenticatedUser }).user = publicUser as AuthenticatedUser;
        return true;
    }
}
```

### `src/auth/current-user.decorator.ts`

```ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { StoredEntity } from '../database/json-collection.js';
import type { User } from '@miracle/types';

/**
 * Форма user-объекта, который AuthGuard кладёт в request после успешной проверки.
 * Без поля password (внутреннее), но с DbEntity-полями (id/createdAt/...).
 */
export type AuthenticatedUser = StoredEntity<User>;

export const CurrentUser = createParamDecorator(
    (_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
        const req = ctx.switchToHttp().getRequest();
        return req.user as AuthenticatedUser;
    },
);
```

### `src/auth/auth.module.ts`

```ts
import { Module } from '@nestjs/common';
import { TokensModule } from '../tokens/tokens.module.js';
import { AuthGuard } from './auth.guard.js';

@Module({
    imports: [TokensModule],
    providers: [AuthGuard],
    exports: [AuthGuard],
})
export class AuthModule {}
```

### `src/health/health.controller.ts`

```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
    @Get()
    check(): { status: 'ok' } {
        return { status: 'ok' };
    }
}
```

### `src/health/health.module.ts`

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

@Module({
    controllers: [HealthController],
})
export class HealthModule {}
```

### `src/users/users.service.ts`

Response — TS-тип `Stored<User>` из `@miracle/types`, **без** обёртки `createZodDto`. Поэтому у `users/` нет каталога `dto/` — он появится только с первым INPUT-эндпоинтом (см. `dto.md`).

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Stored, User } from '@miracle/types';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class UsersService {
    constructor(private readonly db: DatabaseService) {}

    getPublicById(id: string): Stored<User> {
        const user = this.db.collections.users.getById(id);
        if (!user) {
            throw new NotFoundException(`User ${id} not found`);
        }

        const { password: _password, ...publicUser } = user;
        return publicUser as Stored<User>;
    }
}
```

### `src/users/users.controller.ts`

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { Stored, User } from '@miracle/types';
import { UsersService } from './users.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';

@Controller('users')
export class UsersController {
    constructor(private readonly users: UsersService) {}

    @Get('me')
    @UseGuards(AuthGuard)
    getMe(@CurrentUser() user: AuthenticatedUser): Stored<User> {
        return this.users.getPublicById(user.id);
    }
}
```

### `src/users/users.module.ts`

```ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
    controllers: [UsersController],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule {}
```

## Шаг 8 — проверка

1. **Билд** — из `back-nest/`:
   ```bash
   npm run build
   ```
   Никаких TS-ошибок. В `dist/` появляется `main.js`.

2. **Dev-старт** — из `back-nest/`:
   ```bash
   npm run dev
   ```
   В консоли строка `[back-nest] http://localhost:<PORT>`. Без ошибок.

3. **Валидация env** — установить в `.env` `ACCESS_TOKEN_SECRET=` (пустая строка), повторно запустить `npm run dev` — процесс падает с zod-ошибкой `ACCESS_TOKEN_SECRET: too small`. Это правильно. Вернуть значение или убрать строку (тогда сработает дефолт).

4. **Health** — `curl http://localhost:<PORT>/health` → `{"status":"ok"}`.

5. **Auth guard без cookie** — `curl http://localhost:<PORT>/users/me` → 401 с `{"statusCode":401,"message":"Access token invalid","error":"Unauthorized"}`.

6. **Auth guard с валидным cookie** — получить `accessToken` через старый `back` (логин), затем:
   ```bash
   curl http://localhost:<PORT>/users/me -H "Cookie: accessToken=<JWT>"
   ```
   → JSON пользователя без поля `password`.

7. **Версии зафиксированы** — в `back-nest/package.json` все зависимости в виде `^x.y.z`, ни одной `"latest"`.

После прохождения всех проверок этот документ больше не нужен — каркас готов, агенты переходят к `module.md` / `controller.md` / `service.md` для миграции доменов.

## Типичные грабли

- **`reflect-metadata` не импортирован первым** в `main.ts` → декораторы Nest не работают, runtime-ошибки при создании providers. Импортируется **после** `./load-env.js` (env должен загрузиться первее), но **до** всех импортов из `@nestjs/*`.
- **`fastify-cookie` не зарегистрирован** до `app.listen` → `request.cookies` всегда `undefined`. Регистрация — между `NestFactory.create` и `app.listen`.
- **NodeNext-импорты без `.js`** → runtime-ошибка «Cannot find module». В этом пакете все relative-импорты обязаны иметь `.js`-суффикс, даже из `.ts`-файлов (TypeScript оставляет суффикс как есть).
- **`createZodDto` забыт** — если контроллер берёт DTO как `@Body() dto: SomeSchema`, валидация не сработает, потому что Nest не знает, что это zod-схема. Обязательно `extends createZodDto(SomeSchema)`.
- **`@nestjs/jwt` поставлен по ошибке** — он тянет `jsonwebtoken`, который конфликтует по эргономике с `jose`. В этом проекте используется только `jose` (как в текущем `back`).
- **`DB_DIR` не выставлен и при этом запущен старый `back`** — оба процесса начинают писать в свои директории. См. README, секция «Где живут данные».
