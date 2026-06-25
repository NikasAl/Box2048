# Box2048

Гибрид **2048 + Angry Birds + Tetris**: сверху появляется кубик со степенью двойки, тапом по полю задаётся точка назначения, кубик летит туда по параболе и падает под действием гравитации. При столкновении двух кубиков с одинаковым номером они сливаются в один — с удвоенным значением. Game over, когда кубики переполняют поле выше красной линии опасности.

## Стек

| Слой | Технология |
|---|---|
| Движок | [Phaser 3](https://phaser.io/) |
| Физика | Matter.js (встроен в Phaser) |
| Язык | TypeScript |
| Сборщик | Vite |
| Нативная обёртка | Capacitor 6 |
| Реклама | Yandex Mobile Ads SDK (через Capacitor-плагин) |

## Иконка приложения

### Где что лежит

- `Materials/icon_raw.png` — растровый исходник, который вы предоставляете
  (может быть на любом фоне, любой размер; фон используется только для
  поиска границы artwork, сам artwork вырезается как есть).
- `public/assets/icon.svg` — альтернативный минималистичный SVG-исходник
  (используется только скриптом `npm run icons:svg`, если вы prefer вектор).
- `scripts/process_icon.py` — основной скрипт: вырезает artwork из
  `Materials/icon_raw.png`, находит границу иконки, вырезает artwork и
  масштабирует под все Android размеры.
- `scripts/generate_icons.py` — fallback для SVG-пайплайна.

### Дизайн

Иконка — растровое изображение, которое вы кладёте в `Materials/icon_raw.png`.
Скрипт автоматически:
1. Определяет цвет фона (сэмплируя 4 угла)
2. Строит маску пикселей «фон vs artwork» с допуском по цвету
3. Находит bounding box artwork
4. **Вырезает artwork как есть** (с оригинальным фоном внутри bbox) + 8% padding
5. Делает изображение квадратным (добавляет фон на короткие стороны)
6. Масштабирует во все Android-размеры (legacy, round, adaptive foreground)

> Важно: белый фон **не удаляется** из artwork — он используется только
> для поиска границы. Иконка сохраняет свой исходный вид.

### Генерация иконок для Android

После создания `android/` (`npm run cap:add:android`) запустите:

```bash
npm run icons
```

Это прогонит `scripts/process_icon.py --android`, который сгенерирует:
- `mipmap-{mdpi..xxxhdpi}/ic_launcher.png` — классическая иконка
- `mipmap-{mdpi..xxxhdpi}/ic_launcher_round.png` — круглая
- `mipmap-{mdpi..xxxhdpi}/ic_launcher_foreground.png` — adaptive foreground
- `mipmap-anydpi-v26/ic_launcher.xml` + `ic_launcher_round.xml` — adaptive icon
- `values/ic_launcher_background.xml` — цвет фона adaptive icon
- `playstore-icon.png` (512×512) — для Google Play / RuStore

Требования: `pip install pillow`

### Превью иконки (без Android-сборки)

```bash
npm run icons:preview
# → Materials/icons/box2048-icon-{512,192,96,48}.png
# → Materials/icons/box2048-icon-round-512.png
```

### Изменение дизайна

1. Замените `Materials/icon_raw.png` на новый исходник.
2. Прогоните `npm run icons:preview` — посмотрите превью в `Materials/icons/`.
3. Если нравится — `npm run icons` для генерации в `android/`.
4. Пересоберите APK:
   ```bash
   npm run android:debug
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

### Если граница определяется неточно

По умолчанию допуск цвета фона = 60 (по каждому RGB каналу). Если фон
имеет градиент или шум, увеличьте `BG_TOLERANCE` в `scripts/process_icon.py`
до 80–100. Если наоборот — фон «съедает» края artwork, уменьшите до 30–40.

## Запуск в браузере (отладка)

```bash
npm install
npm run dev
```

Открыть http://localhost:5173 — мгновенный hot-reload, DevTools, никаких эмуляторов. Это основной режим разработки.

## Сборка веб-версии (для Яндекс Игр / itch.io)

```bash
npm run build
# → dist/ готов к деплою
```

## Сборка Android APK/AAB

### 1. Установить требования

- **Node.js** 18+ и npm
- **Android Studio** (последняя стабильная)
- **JDK 17** (поставляется с Android Studio)

### 2. Добавить Android-платформу (первый раз)

```bash
npm install
npm run build
npm run cap:add:android
```

После этого появится папка `android/` — это нативный проект Android Studio.

### 3. Запуск на устройстве/эмуляторе

```bash
npm run cap:sync          # синхронизация веб-сборки в android/
npm run cap:open:android  # открыть Android Studio
```

В Android Studio нажать ▶ Run.

### 4. Сборка APK (для теста)

```bash
npm run android:debug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

### 5. Сборка AAB (для публикации в Google Play / RuStore)

```bash
npm run android:release
# → android/app/build/outputs/bundle/release/app-release.aab
```

Для release-сборки нужно сгенерировать signing keystore — см. раздел [Release signing](#release-signing) ниже.

## Ориентация и полноэкранный режим

Приложение жестко ограничено **портретной ориентацией** и работает в **полноэкранном immersive mode** (без статус-бара и навигационной панели, с поддержкой cutout/чёлки).

Всё это настраивается автоматически скриптом `scripts/setup-android.mjs`, который запускается после `cap sync` (см. `package.json` → `cap:sync`, `android:debug`, `android:release`). Скрипт делает:

- В `AndroidManifest.xml`: добавляет `android:screenOrientation="portrait"` на `<activity>`
- В `styles.xml`: тема `Theme.AppCompat.NoActionBar` + `windowFullscreen=true` + `windowNoTitle=true` + `screenOrientation=portrait`
- В `MainActivity.java`: immersive mode через `WindowInsetsControllerCompat`, скрытие system bars + display cutout, перерегистрация при `onResume`/`onWindowFocusChanged`
- В `variables.gradle`: `compileSdkVersion=35`, `targetSdkVersion=35`, `androidxCoreVersion=1.12.0` (нужно для `WindowInsetsControllerCompat`)

## Интеграция Yandex Ads

### Текущее состояние

Полностью рабочий пайплайн, основанный на паттерне из https://github.com/NikasAl/starflow/tree/main/starflow-3d:

- **`src/ads/AdsManager.ts`** — TypeScript-обёртка. В браузере работает как stub (rewarded возвращает `true`, interstitial no-op), на Android автоматически использует нативный плагин через Capacitor.
- **`scripts/setup-android.mjs`** — генерирует нативный Java-плагин `YandexAdsPlugin.java` и `MainActivity.java`, добавляет зависимость Yandex Mobile Ads SDK в `app/build.gradle`, патчит `AndroidManifest.xml` (orientation, fullscreen, HTTP legacy library) и `styles.xml`.
- **`src/config.ts`** → `ADS_CONFIG` — содержит ad unit IDs. Сейчас прописаны официальные demo-IDs Яндекса для тестирования.

### Версия SDK

Используется **Yandex Mobile Ads SDK 8.1.0** (последняя на момент написания).

Breaking changes vs 7.x (используется в starflow):
- `MobileAds.initialize()` → `YandexAds.initialize()` (класс переименован)
- `AdRequestConfiguration` удалён → использовать `AdRequest.Builder(adUnitId).build()`
- `InterstitialAdLoader` / `RewardedAdLoader` / event listeners — API без изменений

Плагин написан на Java (не Kotlin, как предлагалось изначально в этом README), чтобы совпадать с паттерном starflow и не требовать дополнительных Kotlin-dependency настроек в Gradle.

### API плагина

```typescript
// src/ads/AdsManager.ts
interface YandexAdsPlugin {
  initialize(): Promise<void>;
  showRewardedAd(options: { adUnitId: string }): Promise<{ granted: boolean; error?: string }>;
  showInterstitialAd(options: { adUnitId: string }): Promise<{ shown: boolean; error?: string }>;
}
```

В отличие от starflow (где preload был отдельным шагом), наш плагин **загружает и показывает рекламу одним вызовом** — это упрощает логику и устраняет stale-кэш загруженных ad-ов. Плагин сам управляет `RewardedAdLoader` / `InterstitialAdLoader` (singleton-экземпляры).

### Стратегия показа

| Событие | Формат | Частота |
|---|---|---|
| Game Over → экран проигрыша | **Interstitial** | не чаще раза в 90 секунд, каждые 3 смерти |
| Кнопка «Возродиться» | **Rewarded** | по запросу игрока |
| Milestone (32, 64, 128, ...) закрыт | **Interstitial** | с min gap 60s |

### Установка

```bash
# Если ещё не добавляли Android-платформу:
npm run cap:add:android
# Эта команда автоматически запустит scripts/setup-android.mjs,
# который сгенерирует YandexAdsPlugin.java, MainActivity.java и пропатчит
# AndroidManifest.xml, styles.xml, build.gradle, variables.gradle.

# Если Android-платформа уже добавлена — просто пересинхронизируйте:
npm run cap:sync
# (= build + cap sync + setup-android)

# Сборка и установка:
npm run android:debug
npm run android:install
```

### Тестовые ad unit IDs

Yandex предоставляет официальные demo-юниты, которые всегда отдают тестовые креативы — нельзя «накрутить» показы:

- `demo-interstitial-yandex` — interstitial
- `demo-rewarded-yandex` — rewarded
- `demo-banner-yandex` — banner

Эти ID уже прописаны в `src/config.ts` → `ADS_CONFIG`. **Перед публикацией** замените их на реальные ad unit IDs из [кабинета Yandex Advertising Network](https://yandex.ru/dev/mobile-ads/).

### Отладка рекламы

```bash
# Логирование в реальном времени:
npm run android:log
# Фильтрует logcat по тегам: Capacitor, chromium, System.out, YandexAds

# Через chrome://inspect (как для обычного WebView):
# 1. Запустите приложение на устройстве
# 2. Откройте chrome://inspect в Chrome на ПК
# 3. Найдите устройство в списке, нажмите Inspect
```

Логи плагина помечены тегом `YandexAds` — там видно инициализацию SDK, загрузку/показ рекламы, ошибки.

### Если реклама не показывается

1. Проверьте логи через `npm run android:log` — ищите `YandexAds` тег
2. Убедитесь, что `ADS_CONFIG` в `src/config.ts` содержит корректные ad unit IDs (для теста — `demo-interstitial-yandex`)
3. Проверьте, что в `android/app/build.gradle` есть `implementation 'com.yandex.android:mobileads:8.1.0'` (скрипт добавляет автоматически)
4. Убедитесь, что есть интернет на устройстве
5. Demo-юниты иногда могут возвращать `no fill` — это нормально для теста

## Release signing

Сгенерировать keystore (один раз):

```bash
keytool -genkey -v -keystore box2048.keystore -alias box2048 -keyalg RSA -keysize 2048 -validity 10000
```

В `android/app/build.gradle`:

```gradle
android {
    signingConfigs {
        release {
            storeFile file("../../../box2048.keystore")
            storePassword System.getenv("BOX2048_KEYSTORE_PASSWORD")
            keyAlias "box2048"
            keyPassword System.getenv("BOX2048_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

**Важно**: `box2048.keystore` и пароли никогда не коммитить в git. Они уже в `.gitignore`.

## Структура проекта

```
Box2048/
├── src/
│   ├── main.ts                # точка входа Phaser
│   ├── config.ts              # все константы (поле, физика, цвета, реклама)
│   ├── types.ts               # общие TS-типы
│   ├── scenes/
│   │   ├── BootScene.ts       # бутстрап
│   │   ├── PreloadScene.ts    # генерация текстур кубиков
│   │   ├── MenuScene.ts       # главное меню + init рекламы
│   │   ├── GameScene.ts       # основная сцена игры
│   │   └── GameOverScene.ts   # экран проигрыша + кнопка revive
│   ├── objects/
│   │   ├── Cube.ts            # класс кубика (Matter sprite)
│   │   └── Spawner.ts         # спавнер плавающих кубиков
│   ├── systems/
│   │   ├── MergeSystem.ts     # слияние одинаковых кубиков
│   │   ├── ScoreSystem.ts     # очки + рекорд
│   │   └── GameOverDetector.ts# проверка линии проигрыша
│   └── ads/
│       └── AdsManager.ts      # обёртка над Yandex Ads (web stub + native)
├── public/assets/             # спрайты, звуки (пока пусто — всё генерится в коде)
├── capacitor.config.ts        # конфиг Capacitor + ad unit IDs
├── vite.config.ts
├── tsconfig.json
├── index.html
└── package.json
```

## Управление

1. Кубик появляется в верхней части экрана.
2. **Тапните** в любом месте поля — кубик полетит в эту точку.
3. Кубик падает под действием гравитации, сталкиваясь с другими кубиками.
4. Если два кубика с одинаковым значением сталкиваются — они сливаются в один с удвоенным значением.
5. Если любой кубик задержится выше красной линии опасности дольше 1.5 секунды — game over.

## Дальнейшее развитие

- [ ] Реальный Capacitor-плагин для Yandex Ads (Kotlin)
- [ ] Анимация слияния (вспышка, скейл)
- [ ] Вибро-отклик при слиянии (`navigator.vibrate(20)`)
- [ ] Сохранение состояния игры между сессиями
- [ ] Локализация (RU/EN)
- [ ] Таблица рекордов через Яндекс Игры SDK
- [ ] Музыка фон + звук броска
- [ ] Tutorial-оверлей для первого запуска

## Лицензия

MIT — делайте что хотите.
