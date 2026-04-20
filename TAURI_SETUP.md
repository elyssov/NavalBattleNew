# Tauri 2 — Sea Tactics Desktop Wrapper

## Статус: ждёт перезагрузки ПК

VS Build Tools 2022 (C++ workload) установлены, но требуют restart для активации MSVC линкера.

## Что установлено
- **Rust 1.93.1** (rustup) — `rustc --version`
- **@tauri-apps/cli@2.10.1** — `npx tauri --version`
- **VS Build Tools 2022** — MSVC C++ workload (pending restart)

## Структура файлов

```
naval-battle/
├── index.html              ← игра
├── sprites/                ← спрайты кораблей
├── package.json            ← npm + tauri scripts
├── copy-dist.js            ← копирует index.html+sprites → dist/
├── src-tauri/
│   ├── Cargo.toml          ← Rust зависимости (tauri 2)
│   ├── tauri.conf.json     ← конфиг окна, бандла, frontendDist
│   ├── build.rs            ← tauri_build script
│   ├── src/
│   │   └── main.rs         ← точка входа (5 строк)
│   ├── capabilities/
│   │   └── default.json    ← Tauri 2 permissions
│   └── icons/
│       └── icon.png        ← placeholder 32x32
└── dist/                   ← генерируется copy-dist.js (в .gitignore добавить)
```

## После перезагрузки

```bash
cd C:\Projects\naval-battle

# Dev-режим (с hot reload окна):
npx tauri dev

# Продакшн-сборка:
npx tauri build
```

Первая сборка Rust ~3-5 мин (скачивание + компиляция 450 crates). Дальше инкрементально — быстро.

### Результат сборки
- `src-tauri/target/release/sea-tactics.exe` — standalone .exe (~3-5 MB)
- `src-tauri/target/release/bundle/nsis/` — NSIS инсталлер
- `src-tauri/target/release/bundle/msi/` — MSI инсталлер

## Если что-то пошло не так

### "link.exe failed"
MSVC линкер не в PATH. Проверь:
```bash
# Должен быть НЕ Git'овский link.exe:
where link.exe
# Если показывает C:\Program Files\Git\usr\bin\link.exe — Build Tools не подхватились
# Попробуй запустить из Developer Command Prompt for VS 2022
```

### "frontendDist includes src-tauri"
`tauri.conf.json` → `build.frontendDist` должен быть `"../dist"`, НЕ `"../"`.
Скрипт `copy-dist.js` копирует только index.html и sprites в dist/.

### Иконка
Placeholder 32x32. Для нормальной:
```bash
npx tauri icon path/to/512x512.png
```

## TODO
- [ ] Перезагрузить ПК
- [ ] `npx tauri build` — проверить сборку
- [ ] Заменить placeholder иконку на нормальную
- [ ] Добавить `dist/` и `node_modules/` в .gitignore
- [ ] README: полный релиз v1.0 (правила, патчноты, описание)
