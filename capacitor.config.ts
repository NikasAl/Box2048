import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nikasal.box2048',
  appName: 'Box2048',
  webDir: 'dist',
  backgroundColor: '#1a1a2e',
  android: {
    allowMixedContent: false,
    captureInput: true,
    // Enable WebView debugging in debug builds so chrome://inspect works.
    // Automatically false in release builds — Capacitor strips this in prod.
    webContentsDebuggingEnabled: true
  }
  // NOTE: Yandex Ads configuration lives in src/config.ts (ADS_CONFIG) and
  // is consumed by src/ads/AdsManager.ts. The native plugin is generated
  // by scripts/setup-android.mjs into android/app/src/main/java/...
  // and registered in MainActivity.java — no entry needed here.
};

export default config;
