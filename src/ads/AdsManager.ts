/**
 * AdsManager: single entry point for showing ads.
 *
 * Architecture:
 *   - On native Android (Capacitor), it loads the `YandexAds` Capacitor plugin
 *     which is implemented in android/app/src/main/java/.../YandexAdsPlugin.kt.
 *   - On the web (browser), it falls back to a stub that resolves `true`
 *     for rewarded ads (so revive can still be tested) and no-ops for
 *     interstitial/banner.
 *
 * Usage:
 *   await AdsManager.getInstance().init();           // call once at app start
 *   await AdsManager.getInstance().showRewarded();   // returns true if rewarded
 *   await AdsManager.getInstance().maybeShowInterstitialOnDeath(deathCount);
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { ADS_CONFIG } from '../config';
import type { YandexAdsPlugin } from '../types';

// Register the plugin interface. On native, this resolves to the Java/Kotlin
// implementation. On web, registerPlugin returns a stub that throws when called.
const YandexAds = registerPlugin<YandexAdsPlugin>('YandexAds');

class AdsManager {
  private initialized: boolean = false;
  private lastInterstitialShownAt: number = 0;
  private interstitialLoaded: boolean = false;
  private rewardedLoaded: boolean = false;

  private static instance: AdsManager | null = null;
  static getInstance(): AdsManager {
    if (!AdsManager.instance) AdsManager.instance = new AdsManager();
    return AdsManager.instance;
  }

  /**
   * Initialize the Yandex Mobile Ads SDK. On web this is a no-op.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (!Capacitor.isNativePlatform()) {
      console.info('[Ads] Web platform — ads disabled (stub mode).');
      this.initialized = true;
      return;
    }
    try {
      await YandexAds.initialize();
      // Preload both ad formats so they're ready when needed.
      await Promise.all([
        YandexAds.loadInterstitial({ adId: ADS_CONFIG.interstitialAdId })
          .then(() => {
            this.interstitialLoaded = true;
            console.info('[Ads] Interstitial loaded.');
          })
          .catch((e) => console.warn('[Ads] Interstitial load failed:', e)),
        YandexAds.loadRewarded({ adId: ADS_CONFIG.rewardedAdId })
          .then(() => {
            this.rewardedLoaded = true;
            console.info('[Ads] Rewarded loaded.');
          })
          .catch((e) => console.warn('[Ads] Rewarded load failed:', e))
      ]);
      this.initialized = true;
    } catch (e) {
      console.warn('[Ads] init failed:', e);
    }
  }

  /**
   * Show an interstitial after a death, subject to:
   *   - every `interstitialEveryDeaths`-th death
   *   - minimum gap of `interstitialMinGapMs` between interstitials
   */
  async maybeShowInterstitialOnDeath(totalDeaths: number): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (totalDeaths % ADS_CONFIG.interstitialEveryDeaths !== 0) return;
    await this.showInterstitialInternal();
  }

  /**
   * Show an interstitial after a milestone dialog is dismissed.
   * Subject only to the minimum-gap rule.
   */
  async maybeShowInterstitialOnMilestone(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await this.showInterstitialInternal();
  }

  private async showInterstitialInternal(): Promise<void> {
    const now = Date.now();
    if (now - this.lastInterstitialShownAt < ADS_CONFIG.interstitialMinGapMs) return;
    if (!this.interstitialLoaded) {
      YandexAds.loadInterstitial({ adId: ADS_CONFIG.interstitialAdId }).catch(
        () => {}
      );
      return;
    }
    try {
      await YandexAds.showInterstitial();
      this.lastInterstitialShownAt = Date.now();
      this.interstitialLoaded = false;
      YandexAds.loadInterstitial({ adId: ADS_CONFIG.interstitialAdId })
        .then(() => (this.interstitialLoaded = true))
        .catch(() => {});
    } catch (e) {
      console.warn('[Ads] showInterstitial failed:', e);
    }
  }

  /**
   * Show a rewarded ad. Resolves `true` if the user earned the reward,
   * `false` if the ad was skipped or failed.
   */
  async showRewarded(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      // Web stub: pretend the reward was granted so the revive button works.
      console.info('[Ads] Web stub: granting fake rewarded.');
      return true;
    }
    if (!this.rewardedLoaded) {
      // Try to load on demand.
      try {
        await YandexAds.loadRewarded({ adId: ADS_CONFIG.rewardedAdId });
        this.rewardedLoaded = true;
      } catch {
        return false;
      }
    }
    try {
      await YandexAds.showRewarded();
      this.rewardedLoaded = false;
      // Preload next.
      YandexAds.loadRewarded({ adId: ADS_CONFIG.rewardedAdId })
        .then(() => (this.rewardedLoaded = true))
        .catch(() => {});
      return true;
    } catch (e) {
      console.warn('[Ads] showRewarded failed:', e);
      return false;
    }
  }
}

export { AdsManager };
