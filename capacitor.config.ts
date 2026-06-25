import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nikasal.box2048',
  appName: 'Box2048',
  webDir: 'dist',
  backgroundColor: '#1a1a2e',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  },
  plugins: {
    // YandexAds plugin configuration will be added here
    // after the native plugin is implemented in android/ module.
    YandexAds: {
      // Use test ad unit IDs during development.
      // Replace with production IDs before release.
      interstitialAdId: 'demo-interstitial',
      rewardedAdId: 'demo-rewarded',
      bannerAdId: 'demo-banner'
    }
  }
};

export default config;
