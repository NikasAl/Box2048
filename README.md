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

## Интеграция Yandex Ads

### Текущее состояние

В проекте уже есть:
- `src/ads/AdsManager.ts` — TypeScript-обёртка с интерфейсом `initialize() / showRewarded() / maybeShowInterstitialOnDeath()`. В браузере работает как stub (rewarded возвращает `true`, interstitial no-op), на Android автоматически использует нативный плагин через Capacitor.
- `capacitor.config.ts` — конфигурация с блоком `plugins.YandexAds` (тестовые ad unit ID).

### Что нужно сделать (нативный плагин)

После `npm run cap:add:android` нужно создать файл `android/app/src/main/java/com/nikasal/box2048/YandexAdsPlugin.kt` со следующей структурой:

```kotlin
package com.nikasal.box2048

import com.getcapacitor.*
import com.yandex.mobile.ads.common.MobileAds
import com.yandex.mobile.ads.interstitial.InterstitialAd
import com.yandex.mobile.ads.interstitial.InterstitialAdLoader
import com.yandex.mobile.ads.rewarded.RewardedAd
import com.yandex.mobile.ads.rewarded.RewardedAdLoader

@CapacitorPlugin(name = "YandexAds")
class YandexAdsPlugin : Plugin() {

    private var interstitial: InterstitialAd? = null
    private var rewarded: RewardedAd? = null

    @PluginMethod
    fun initialize(call: PluginCall) {
        MobileAds.initialize(context) { Log.d("YandexAds", "initialized") }
        call.resolve()
    }

    @PluginMethod
    fun loadInterstitial(call: PluginCall) {
        val adId = call.getString("adId") ?: return call.reject("adId required")
        val loader = InterstitialAdLoader(context)
        loader.loadAd(... ) { ad, error ->
            if (ad != null) { interstitial = ad; notifyListeners("interstitial_loaded", null) }
        }
        call.resolve()
    }

    @PluginMethod
    fun showInterstitial(call: PluginCall) {
        activity.runOnUiThread {
            interstitial?.show(activity)
            interstitial = null
            call.resolve()
        }
    }

    @PluginMethod
    fun loadRewarded(call: PluginCall) { /* аналогично */ }

    @PluginMethod
    fun showRewarded(call: PluginCall) {
        activity.runOnUiThread {
            rewarded?.setRewardListener { reward ->
                notifyListeners("rewarded_earned", JSObject().put("amount", reward.amount))
            }
            rewarded?.show(activity)
            rewarded = null
            call.resolve()
        }
    }
}
```

И зарегистрировать плагин в `android/app/src/main/assets/capacitor.plugins.json`:

```json
[
  {
    "pkg": "com.nikasal.box2048.YandexAdsPlugin",
    "classpath": "com.nikasal.box2048.YandexAdsPlugin"
  }
]
```

### Подключение Yandex Mobile Ads SDK в Gradle

В `android/app/build.gradle` добавить:

```gradle
dependencies {
    implementation 'com.yandex.android:mobileads:7.2.0'  // проверить последнюю версию
}
```

В `android/build.gradle` (project-level) убедиться, что есть репозиторий Yandex:

```gradle
allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url "https://maven.yandex.net/repository/maven-central" }
    }
}
```

### Конфигурация App ID в AndroidManifest.xml

Yandex Mobile Ads требует **явного объявления ad unit ID** в манифесте только для некоторых форматов. Interstitial и Rewarded загружаются динамически через `loadAd(adUnitId)`. Получить реальные ad unit ID нужно в [кабинете Yandex Advertising Network](https://yandex.ru/dev/mobile-ads/).

### Тестовые ad unit ID

Yandex предоставляет демо-юниты для тестирования (см. [документацию](https://yandex.ru/dev/mobile-ads/doc/dg/android/about-test-adunits.html)). Не используйте реальные ad unit ID в debug-сборке — это может привести к блокировке аккаунта за «накрутку».

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
