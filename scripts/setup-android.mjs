#!/usr/bin/env node
// ============================================================
// Box2048 — Android Post-Sync Setup
// Forces PORTRAIT orientation, fullscreen immersive mode,
// hides status bar / navigation bar / camera notch,
// integrates Yandex Mobile Ads SDK 8.1.0 via a Capacitor plugin.
//
// Pattern adapted from https://github.com/NikasAl/starflow
// ============================================================

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const androidDir = join(rootDir, 'android');

if (!existsSync(androidDir)) {
  console.log('[setup-android] No android/ directory found. Skipping.');
  console.log('[setup-android] Run "npm run cap:add:android" first.');
  process.exit(0);
}

// Application package paths derived from capacitor.config.ts appId.
const APP_ID = 'com.nikasal.box2048';
const PACKAGE_PATH = APP_ID.split('.').join('/');
const PLUGIN_DIR = join(androidDir, 'app', 'src', 'main', 'java', ...APP_ID.split('.'));

// Yandex Mobile Ads SDK version. 8.1.0 is the latest release as of 2026.
// Migration notes vs 7.x used in starflow:
//   - MobileAds.initialize()        → YandexAds.initialize()
//   - AdRequestConfiguration        → removed, use AdRequest directly
//   - InterstitialAdLoader / RewardedAdLoader — same API names
//   - Event listener interfaces     — same names
const YANDEX_SDK_VERSION = '8.1.0';

// ----------------------------------------------------------------------------
// 1. Force PORTRAIT orientation in AndroidManifest.xml
// ----------------------------------------------------------------------------
const manifestPath = join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
if (existsSync(manifestPath)) {
  let manifest = readFileSync(manifestPath, 'utf-8');
  if (!manifest.includes('screenOrientation=')) {
    // Insert into the first <activity> tag.
    manifest = manifest.replace(
      '<activity',
      '<activity android:screenOrientation="portrait"'
    );
    writeFileSync(manifestPath, manifest, 'utf-8');
    console.log('[setup-android] Set portrait orientation in AndroidManifest.xml');
  } else if (!manifest.includes('screenOrientation="portrait"')) {
    // Replace any existing orientation (landscape/sensor, etc.) with portrait.
    manifest = manifest.replace(
      /android:screenOrientation="[^"]*"/,
      'android:screenOrientation="portrait"'
    );
    writeFileSync(manifestPath, manifest, 'utf-8');
    console.log('[setup-android] Replaced orientation with portrait in AndroidManifest.xml');
  } else {
    console.log('[setup-android] Portrait orientation already set.');
  }
} else {
  console.log(`[setup-android] AndroidManifest.xml not found at ${manifestPath}`);
}

// ----------------------------------------------------------------------------
// 2. Set fullscreen + portrait + NoActionBar in styles.xml
// ----------------------------------------------------------------------------
const stylesPath = join(androidDir, 'app', 'src', 'main', 'res', 'values', 'styles.xml');
if (existsSync(stylesPath)) {
  let styles = readFileSync(stylesPath, 'utf-8');
  let modified = false;

  // Ensure NoActionBar parent theme
  if (!styles.includes('Theme.AppCompat.NoActionBar') && !styles.includes('windowNoTitle')) {
    styles = styles.replace(
      '<style name="AppTheme"',
      '<style name="AppTheme" parent="Theme.AppCompat.NoActionBar"'
    );
    modified = true;
  }

  // Add fullscreen + windowNoTitle + portrait + black background.
  if (!styles.includes('windowFullscreen')) {
    styles = styles.replace(
      '</style>',
      '        <item name="android:windowFullscreen">true</item>\n' +
      '        <item name="android:windowNoTitle">true</item>\n' +
      '        <item name="android:screenOrientation">portrait</item>\n' +
      '        <item name="android:windowBackground">#1a1a2e</item>\n' +
      '    </style>'
    );
    modified = true;
  } else if (!styles.includes('windowBackground')) {
    styles = styles.replace(
      '</style>',
      '        <item name="android:windowBackground">#1a1a2e</item>\n    </style>'
    );
    modified = true;
  }

  if (modified) {
    writeFileSync(stylesPath, styles, 'utf-8');
    console.log('[setup-android] Updated styles.xml with fullscreen + portrait + NoActionBar');
  } else {
    console.log('[setup-android] styles.xml already configured.');
  }
}

// ----------------------------------------------------------------------------
// 3. Ensure androidx.core dependency is available for WindowInsetsControllerCompat
// ----------------------------------------------------------------------------
const variablesPath = join(androidDir, 'variables.gradle');
if (existsSync(variablesPath)) {
  let vars = readFileSync(variablesPath, 'utf-8');

  // Upgrade compileSdkVersion and targetSdkVersion to 35
  let sdkUpdated = false;
  vars = vars.replace(
    /compileSdkVersion\s*=\s*\d+/,
    () => { sdkUpdated = true; return 'compileSdkVersion = 35'; }
  );
  vars = vars.replace(
    /targetSdkVersion\s*=\s*\d+/,
    () => { sdkUpdated = true; return 'targetSdkVersion = 35'; }
  );
  if (sdkUpdated) {
    writeFileSync(variablesPath, vars, 'utf-8');
    console.log('[setup-android] Upgraded compileSdkVersion/targetSdkVersion to 35.');
  } else {
    console.log('[setup-android] compileSdkVersion/targetSdkVersion already at 35+.');
  }

  // Ensure androidxCoreVersion is at least 1.12.0
  if (!vars.includes('androidxCoreVersion')) {
    vars = vars.replace(
      'ext {',
      'ext {\n    androidxCoreVersion = "1.12.0"'
    );
    writeFileSync(variablesPath, vars, 'utf-8');
    console.log('[setup-android] Added androidxCoreVersion to variables.gradle');
  } else if (
    vars.includes('androidxCoreVersion = "1.6.0"') ||
    vars.includes('androidxCoreVersion = "1.9.0"') ||
    vars.includes('androidxCoreVersion = "1.10.0"') ||
    vars.includes('androidxCoreVersion = "1.11.0"')
  ) {
    vars = vars.replace(
      /androidxCoreVersion\s*=\s*"[^"]*"/,
      'androidxCoreVersion = "1.12.0"'
    );
    writeFileSync(variablesPath, vars, 'utf-8');
    console.log('[setup-android] Upgraded androidxCoreVersion to 1.12.0 in variables.gradle');
  } else {
    console.log('[setup-android] variables.gradle already has suitable androidxCoreVersion.');
  }
}

// ----------------------------------------------------------------------------
// 4. Add Yandex Mobile Ads SDK dependency to app/build.gradle
//    SDK is on Maven Central — no custom repo needed.
// ----------------------------------------------------------------------------
const appBuildGradle = join(androidDir, 'app', 'build.gradle');
if (existsSync(appBuildGradle)) {
  let appGradle = readFileSync(appBuildGradle, 'utf-8');
  if (!appGradle.includes('com.yandex.android:mobileads')) {
    appGradle = appGradle.replace(
      /dependencies\s*\{/,
      `dependencies {
        implementation 'com.yandex.android:mobileads:${YANDEX_SDK_VERSION}'`
    );
    writeFileSync(appBuildGradle, appGradle, 'utf-8');
    console.log(`[setup-android] Added Yandex Mobile Ads SDK ${YANDEX_SDK_VERSION} dependency`);
  } else {
    const versionPattern = /com\.yandex\.android:mobileads:(\d+\.\d+\.\d+)/;
    const match = appGradle.match(versionPattern);
    if (match && match[1] !== YANDEX_SDK_VERSION) {
      appGradle = appGradle.replace(
        versionPattern,
        `com.yandex.android:mobileads:${YANDEX_SDK_VERSION}`
      );
      writeFileSync(appBuildGradle, appGradle, 'utf-8');
      console.log(`[setup-android] Updated Yandex Mobile Ads SDK from ${match[1]} to ${YANDEX_SDK_VERSION}`);
    } else {
      console.log(`[setup-android] Yandex Mobile Ads SDK ${YANDEX_SDK_VERSION} already in build.gradle.`);
    }
  }
}

// ----------------------------------------------------------------------------
// 5. Create YandexAdsPlugin.java — Capacitor plugin wrapping Yandex Mobile Ads SDK 8.x
// ----------------------------------------------------------------------------
mkdirSync(PLUGIN_DIR, { recursive: true });
const pluginPath = join(PLUGIN_DIR, 'YandexAdsPlugin.java');

const pluginSource = `package ${APP_ID};

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Yandex Mobile Ads SDK 8.x imports.
// Breaking changes vs 7.x:
//   - com.yandex.mobile.ads.common.MobileAds  →  com.yandex.mobile.ads.common.YandexAds
//     (Kotlin object — in Java, call YandexAds.INSTANCE.initialize(...),
//      NOT YandexAds.initialize(...) which is a static method placeholder
//      that doesn't actually dispatch to the singleton)
//   - AdRequestConfiguration removed          →  use AdRequest.Builder(adUnitId).build()
//   - BannerAdSize.fixedSize/inlineSize       →  BannerAdSize.inline(ctx, wDp, hDp)
//   - BannerAdView.setAdUnitId removed        →  ad unit id passed via AdRequest.Builder(adUnitId)
//   - BannerAdEventListener: only 4 methods   →  onAdLoaded, onAdFailedToLoad, onAdClicked, onImpression
import com.yandex.mobile.ads.banner.BannerAdEventListener;
import com.yandex.mobile.ads.banner.BannerAdSize;
import com.yandex.mobile.ads.banner.BannerAdView;
import com.yandex.mobile.ads.common.AdError;
import com.yandex.mobile.ads.common.AdRequest;
import com.yandex.mobile.ads.common.AdRequestError;
import com.yandex.mobile.ads.common.ImpressionData;
import com.yandex.mobile.ads.common.InitializationListener;
import com.yandex.mobile.ads.common.YandexAds;
import com.yandex.mobile.ads.interstitial.InterstitialAd;
import com.yandex.mobile.ads.interstitial.InterstitialAdEventListener;
import com.yandex.mobile.ads.interstitial.InterstitialAdLoadListener;
import com.yandex.mobile.ads.interstitial.InterstitialAdLoader;
import com.yandex.mobile.ads.rewarded.Reward;
import com.yandex.mobile.ads.rewarded.RewardedAd;
import com.yandex.mobile.ads.rewarded.RewardedAdEventListener;
import com.yandex.mobile.ads.rewarded.RewardedAdLoadListener;
import com.yandex.mobile.ads.rewarded.RewardedAdLoader;

// Android View imports for banner overlay
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;

@CapacitorPlugin(
    name = "YandexAds"
)
public class YandexAdsPlugin extends Plugin {

    @Nullable
    private RewardedAd rewardedAd = null;
    @Nullable
    private RewardedAdLoader rewardedAdLoader = null;
    @Nullable
    private InterstitialAd interstitialAd = null;
    @Nullable
    private InterstitialAdLoader interstitialAdLoader = null;
    @Nullable
    private BannerAdView bannerAdView = null;
    private boolean rewardGranted = false;
    private PluginCall savedCall = null;
    private boolean interstitialCallSaved = false;
    private boolean sdkInitialized = false;
    private Handler mainHandler = new Handler(Looper.getMainLooper());

    public YandexAdsPlugin() {
        android.util.Log.i("YandexAds", "=== YandexAdsPlugin CONSTRUCTOR ===");
    }

    @Override
    public void load() {
        android.util.Log.i("YandexAds", "=== load() called, initializing SDK ===");
        mainHandler.post(() -> {
            try {
                // SDK 8.x: YandexAds is a Kotlin object (singleton).
                // In Java, you MUST access it via YandexAds.INSTANCE.initialize(...)
                // — calling YandexAds.initialize(...) directly compiles but does
                // NOT dispatch to the singleton at runtime (it's a static
                // placeholder method).
                YandexAds.INSTANCE.initialize(getContext(), new InitializationListener() {
                    @Override
                    public void onInitializationCompleted() {
                        sdkInitialized = true;
                        android.util.Log.i("YandexAds", "SDK initialized successfully");
                    }
                });
            } catch (Exception e) {
                android.util.Log.e("YandexAds", "SDK init error in load(): " + e.getMessage(), e);
            }
        });
    }

    @Override
    public void handleOnDestroy() {
        // Make sure to clean up the banner when the plugin (and thus the
        // activity) is being torn down — otherwise the auto-refresh timer
        // keeps running and leaks memory.
        hideBannerView();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void initialize(final PluginCall call) {
        // SDK is already initialized in load(). Resolve immediately.
        android.util.Log.i("YandexAds", "=== initialize() called, sdkInitialized=" + sdkInitialized);
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void showRewardedAd(final PluginCall call) {
        final String adUnitId = call.getString("adUnitId");
        if (adUnitId == null || adUnitId.isEmpty()) {
            call.reject("adUnitId is required");
            return;
        }

        savedCall = call;
        rewardGranted = false;
        android.util.Log.i("YandexAds", "showRewardedAd called with unitId=" + adUnitId);

        mainHandler.post(() -> {
            try {
                final Activity activity = getActivity();
                if (activity == null) {
                    android.util.Log.w("YandexAds", "Activity is null, cannot show ad");
                    resolveAdResult(false, "Activity is null");
                    return;
                }

                if (rewardedAdLoader == null) {
                    android.util.Log.i("YandexAds", "Creating RewardedAdLoader");
                    rewardedAdLoader = new RewardedAdLoader(getContext());
                }

                // SDK 8.x: AdRequest replaces the removed AdRequestConfiguration.
                final AdRequest adRequest = new AdRequest.Builder(adUnitId).build();
                android.util.Log.i("YandexAds", "Loading ad with unitId=" + adUnitId);

                // SDK 8.x BREAKING CHANGE: setAdLoadListener() was removed.
                // The listener is now passed directly to loadAd() as the 2nd arg.
                rewardedAdLoader.loadAd(adRequest, new RewardedAdLoadListener() {
                    @Override
                    public void onAdLoaded(@NonNull final RewardedAd ad) {
                        android.util.Log.i("YandexAds", "Ad loaded, showing...");
                        rewardedAd = ad;
                        ad.setAdEventListener(new RewardedAdEventListener() {
                            @Override
                            public void onAdShown() {
                                android.util.Log.i("YandexAds", "Ad shown");
                            }

                            @Override
                            public void onAdFailedToShow(@NonNull AdError error) {
                                // Do NOT reject here — mediation partners (e.g. Mintegral)
                                // may fire onAdFailedToShow AFTER the ad is already visible.
                                // Rejecting here would null out savedCall, preventing
                                // onAdDismissed from resolving the promise.
                                android.util.Log.w("YandexAds", "onAdFailedToShow (ignoring, ad may still be visible): " + error);
                            }

                            @Override
                            public void onAdImpression(@Nullable ImpressionData impressionData) {
                                android.util.Log.i("YandexAds", "Ad impression");
                            }

                            @Override
                            public void onAdClicked() {}

                            @Override
                            public void onRewarded(@NonNull Reward reward) {
                                android.util.Log.i("YandexAds", "User rewarded (flag only, resolving on dismiss)");
                                rewardGranted = true;
                                // Do NOT resolve here — wait for onAdDismissed so the
                                // promise stays pending while the ad is still visible.
                            }

                            @Override
                            public void onAdDismissed() {
                                android.util.Log.i("YandexAds", "onAdDismissed: resolving promise, granted=" + rewardGranted);
                                resolveAdResult(rewardGranted, null);
                                cleanupRewardedAd();
                            }
                        });
                        ad.show(activity);
                    }

                    @Override
                    public void onAdFailedToLoad(@NonNull AdRequestError adRequestError) {
                        android.util.Log.e("YandexAds", "Ad failed to load: " + adRequestError);
                        rejectAdResult("Ad failed to load: " + adRequestError);
                    }
                });
            } catch (Exception e) {
                android.util.Log.e("YandexAds", "Exception in showRewardedAd: " + e.getMessage(), e);
                resolveAdResult(false, "Exception: " + e.getMessage());
            }
        });
    }

    private void cleanupRewardedAd() {
        if (rewardedAd != null) {
            rewardedAd.setAdEventListener(null);
            rewardedAd = null;
        }
    }

    @PluginMethod
    public void showInterstitialAd(final PluginCall call) {
        final String adUnitId = call.getString("adUnitId");
        if (adUnitId == null || adUnitId.isEmpty()) {
            call.reject("adUnitId is required");
            return;
        }

        savedCall = call;
        interstitialCallSaved = true;
        android.util.Log.i("YandexAds", "showInterstitialAd called with unitId=" + adUnitId);

        mainHandler.post(() -> {
            try {
                final Activity activity = getActivity();
                if (activity == null) {
                    android.util.Log.w("YandexAds", "Activity is null, cannot show interstitial");
                    resolveInterstitialResult(false, "Activity is null");
                    return;
                }

                if (interstitialAdLoader == null) {
                    android.util.Log.i("YandexAds", "Creating InterstitialAdLoader");
                    interstitialAdLoader = new InterstitialAdLoader(getContext());
                }

                // SDK 8.x: AdRequest replaces the removed AdRequestConfiguration.
                final AdRequest adRequest = new AdRequest.Builder(adUnitId).build();
                android.util.Log.i("YandexAds", "Loading interstitial ad with unitId=" + adUnitId);

                // SDK 8.x BREAKING CHANGE: setAdLoadListener() was removed.
                // The listener is now passed directly to loadAd() as the 2nd arg.
                interstitialAdLoader.loadAd(adRequest, new InterstitialAdLoadListener() {
                    @Override
                    public void onAdLoaded(@NonNull final InterstitialAd ad) {
                        android.util.Log.i("YandexAds", "Interstitial ad loaded, showing...");
                        interstitialAd = ad;
                        ad.setAdEventListener(new InterstitialAdEventListener() {
                            @Override
                            public void onAdShown() {
                                android.util.Log.i("YandexAds", "Interstitial ad shown");
                            }

                            @Override
                            public void onAdFailedToShow(@NonNull AdError error) {
                                android.util.Log.w("YandexAds", "Interstitial onAdFailedToShow: " + error);
                            }

                            @Override
                            public void onAdImpression(@Nullable ImpressionData impressionData) {
                                android.util.Log.i("YandexAds", "Interstitial ad impression");
                            }

                            @Override
                            public void onAdClicked() {}

                            @Override
                            public void onAdDismissed() {
                                android.util.Log.i("YandexAds", "Interstitial onAdDismissed");
                                resolveInterstitialResult(true, null);
                                cleanupInterstitialAd();
                            }
                        });
                        ad.show(activity);
                    }

                    @Override
                    public void onAdFailedToLoad(@NonNull AdRequestError adRequestError) {
                        android.util.Log.e("YandexAds", "Interstitial failed to load: " + adRequestError);
                        resolveInterstitialResult(false, "Failed to load: " + adRequestError);
                    }
                });
            } catch (Exception e) {
                android.util.Log.e("YandexAds", "Exception in showInterstitialAd: " + e.getMessage(), e);
                resolveInterstitialResult(false, "Exception: " + e.getMessage());
            }
        });
    }

    private void cleanupInterstitialAd() {
        if (interstitialAd != null) {
            interstitialAd.setAdEventListener(null);
            interstitialAd = null;
        }
    }

    private void resolveInterstitialResult(boolean shown, String error) {
        if (savedCall == null || !interstitialCallSaved) return;
        interstitialCallSaved = false;
        JSObject result = new JSObject();
        result.put("shown", shown);
        if (error != null) {
            result.put("error", error);
        }
        try {
            savedCall.resolve(result);
        } catch (Exception ignored) {
        }
        savedCall = null;
    }

    private void resolveAdResult(boolean granted, String error) {
        if (savedCall == null || interstitialCallSaved) return;
        JSObject result = new JSObject();
        result.put("granted", granted);
        if (error != null) {
            result.put("error", error);
        }
        try {
            savedCall.resolve(result);
        } catch (Exception ignored) {
            // PluginCall may already be released
        }
        savedCall = null;
    }

    private void rejectAdResult(String message) {
        if (savedCall == null || interstitialCallSaved) return;
        try {
            savedCall.reject(message);
        } catch (Exception ignored) {
        }
        savedCall = null;
    }

    // ====================================================================
    // Banner ad
    // ====================================================================
    //
    // Adapted from the working implementation in Di2048
    // (https://github.com/NikasAl/Di2048) which uses Yandex SDK 8.1.0.
    //
    // Key API facts for 8.1.0 (verified against both the AAR and Di2048):
    //   - BannerAdView(Context) constructor only — no setAdUnitId().
    //   - BannerAdSize.inline(ctx, widthDp, heightDp) — adaptive inline
    //     banner with explicit height (we use 100dp, matches Di2048).
    //     sticky(ctx, w) also exists but inline is more predictable.
    //   - Ad unit id is passed via AdRequest.Builder(adUnitId).build().
    //   - BannerAdEventListener has 4 methods: onAdLoaded, onAdFailedToLoad,
    //     onAdClicked, onImpression.
    //   - The view is added to the activity's root RelativeLayout with
    //     ALIGN_PARENT_BOTTOM + CENTER_HORIZONTAL.
    //
    // IMPORTANT: the demo ad unit id 'demo-banner-yandex' may return
    // 'no fill' in production. For real banner delivery you need a real
    // ad unit id from the Yandex Advertising Network dashboard (format
    // 'R-M-XXXXXX-X'). The plugin logs load failures so you can verify
    // via 'npm run android:log' (filter by 'YandexAds' tag).

    @PluginMethod
    public void showBannerAd(final PluginCall call) {
        final String adUnitId = call.getString("adUnitId");
        if (adUnitId == null || adUnitId.isEmpty()) {
            call.reject("adUnitId is required");
            return;
        }

        mainHandler.post(() -> {
            try {
                final Activity activity = getActivity();
                if (activity == null) {
                    call.reject("Activity is null");
                    return;
                }

                // If a banner is already shown, remove it first.
                hideBannerView();

                bannerAdView = new BannerAdView(activity);

                // Adaptive inline banner: width = min(screenWidthDp, 728),
                // height = 100 dp. This matches Di2048's working setup.
                android.util.DisplayMetrics dm = activity.getResources().getDisplayMetrics();
                int screenWidthDp = Math.round(dm.widthPixels / dm.density);
                int widthDp = Math.min(screenWidthDp, 728);
                bannerAdView.setAdSize(BannerAdSize.inline(activity, widthDp, 100));

                bannerAdView.setBannerAdEventListener(new BannerAdEventListener() {
                    @Override
                    public void onAdLoaded() {
                        android.util.Log.i("YandexAds", "Banner loaded");
                    }

                    @Override
                    public void onAdFailedToLoad(@NonNull AdRequestError error) {
                        android.util.Log.w("YandexAds", "Banner failed to load: " + error);
                    }

                    @Override
                    public void onAdClicked() {
                        android.util.Log.i("YandexAds", "Banner clicked");
                    }

                    @Override
                    public void onImpression(@Nullable ImpressionData impressionData) {
                        android.util.Log.i("YandexAds", "Banner impression");
                    }
                });

                // Add the banner to the activity's root content view,
                // anchored to the bottom-center.
                //
                // Capacitor's BridgeActivity uses a FrameLayout as
                // android.R.id.content. RelativeLayout rules (ALIGN_PARENT_BOTTOM)
                // are silently IGNORED when the parent is a FrameLayout —
                // the view just lands at top-left. That's why the banner
                // was appearing at the top of the screen.
                //
                // Fix: use FrameLayout.LayoutParams with Gravity.BOTTOM.
                // Di2048 uses RelativeLayout because they own the root layout;
                // we don't (Capacitor does), so we must match its FrameLayout.
                ViewGroup rootView = (ViewGroup) activity.findViewById(android.R.id.content);
                FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT
                );
                params.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
                bannerAdView.setLayoutParams(params);
                rootView.addView(bannerAdView);

                // Load the first ad creative. The ad unit id is passed
                // via AdRequest.Builder — BannerAdView has no setAdUnitId.
                final AdRequest adRequest = new AdRequest.Builder(adUnitId).build();
                bannerAdView.loadAd(adRequest);
                bannerAdView.setVisibility(android.view.View.VISIBLE);

                android.util.Log.i("YandexAds", "Banner shown, adUnitId=" + adUnitId + ", widthDp=" + widthDp);
                JSObject result = new JSObject();
                result.put("shown", true);
                call.resolve(result);
            } catch (Exception e) {
                android.util.Log.e("YandexAds", "Exception in showBannerAd: " + e.getMessage(), e);
                call.reject("Exception: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void hideBannerAd(final PluginCall call) {
        mainHandler.post(() -> {
            try {
                hideBannerView();
                android.util.Log.i("YandexAds", "Banner hidden");
                JSObject result = new JSObject();
                result.put("hidden", true);
                call.resolve(result);
            } catch (Exception e) {
                android.util.Log.e("YandexAds", "Exception in hideBannerAd: " + e.getMessage(), e);
                call.reject("Exception: " + e.getMessage());
            }
        });
    }

    private void hideBannerView() {
        if (bannerAdView == null) return;
        try {
            ViewGroup parent = (ViewGroup) bannerAdView.getParent();
            if (parent != null) {
                parent.removeView(bannerAdView);
            }
            bannerAdView.destroy();
        } catch (Exception ignored) {
        }
        bannerAdView = null;
    }
}
`;

writeFileSync(pluginPath, pluginSource, 'utf-8');
console.log('[setup-android] Generated YandexAdsPlugin.java');

// ----------------------------------------------------------------------------
// 6. Write complete MainActivity.java with immersive mode + YandexAdsPlugin registration
// ----------------------------------------------------------------------------
const mainActivityPath = join(PLUGIN_DIR, 'MainActivity.java');
mkdirSync(dirname(mainActivityPath), { recursive: true });

const mainActivitySource = `package ${APP_ID};

import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // CRITICAL: Register plugins BEFORE super.onCreate().
        // When bridge is null, registerPlugin() stores classes in pendingPluginClasses.
        // Bridge init() (called by super.onCreate) then processes them properly.
        // Registering AFTER super.onCreate() causes "plugin is not implemented on android".
        Log.i("Box2048Main", "=== Registering YandexAdsPlugin ===");
        registerPlugin(YandexAdsPlugin.class);
        Log.i("Box2048Main", "=== registerPlugin() returned ===");

        super.onCreate(savedInstanceState);

        // Edge-to-edge fullscreen immersive mode
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(0xFF1a1a2e);
        getWindow().setNavigationBarColor(0xFF1a1a2e);
        hideSystemBars();

        // Handle display cutout (camera notch / punch-hole)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemBars();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemBars();
    }
}
`;

writeFileSync(mainActivityPath, mainActivitySource, 'utf-8');
console.log('[setup-android] Wrote complete MainActivity.java (immersive + YandexAdsPlugin)');

// ----------------------------------------------------------------------------
// 7. Add HTTP legacy library to AndroidManifest.xml
//    Required by Yandex Mobile Ads SDK for network requests.
//    Note: we use a plain <uses-library> declaration (no tools:node) to avoid
//    the warning "tagged to replace another declaration but no other
//    declaration present" that appears on Android 14+ where the system already
//    provides this library. We also clean up any previous tools:node="replace"
//    attribute that older versions of this script may have written.
// ----------------------------------------------------------------------------
if (existsSync(manifestPath)) {
  let manifest = readFileSync(manifestPath, 'utf-8');
  let modified = false;

  // Clean up legacy tools:node="replace" if present (from older script runs).
  if (manifest.includes('org.apache.http.legacy') && manifest.includes('tools:node="replace"')) {
    manifest = manifest.replace(
      /<uses-library android:name="org\.apache\.http\.legacy"[^/]*\/>/,
      '<uses-library android:name="org.apache.http.legacy" android:required="false" />'
    );
    modified = true;
    console.log('[setup-android] Cleaned up tools:node="replace" on org.apache.http.legacy');
  }

  if (!manifest.includes('org.apache.http.legacy')) {
    if (!manifest.includes('xmlns:tools="http://schemas.android.com/tools"')) {
      manifest = manifest.replace(
        '<manifest',
        '<manifest xmlns:tools="http://schemas.android.com/tools"'
      );
    }
    manifest = manifest.replace(
      '</application>',
      '        <uses-library android:name="org.apache.http.legacy" android:required="false" />\n    </application>'
    );
    modified = true;
    console.log('[setup-android] Added HTTP legacy library to AndroidManifest.xml');
  } else if (!modified) {
    console.log('[setup-android] HTTP legacy library already in AndroidManifest.xml.');
  }

  if (modified) {
    writeFileSync(manifestPath, manifest, 'utf-8');
  }
}

// ----------------------------------------------------------------------------
// 8. Suppress compileSdk=35 warning on older Android Gradle Plugin (8.2.x)
//    Capacitor 6 ships with AGP 8.2.1 which was tested up to compileSdk=34.
//    Setting compileSdk=35 (required by Google Play as of Aug 2024) triggers
//    a non-fatal warning. We suppress it explicitly.
// ----------------------------------------------------------------------------
const gradlePropsPath = join(androidDir, 'gradle.properties');
if (existsSync(gradlePropsPath)) {
  let gprops = readFileSync(gradlePropsPath, 'utf-8');
  if (!gprops.includes('android.suppressUnsupportedCompileSdk=35')) {
    gprops += '\n# Suppress compileSdk=35 warning on AGP 8.2.x (tested only up to 34)\nandroid.suppressUnsupportedCompileSdk=35\n';
    writeFileSync(gradlePropsPath, gprops, 'utf-8');
    console.log('[setup-android] Added android.suppressUnsupportedCompileSdk=35 to gradle.properties');
  } else {
    console.log('[setup-android] suppressUnsupportedCompileSdk already set.');
  }
}

console.log('[setup-android] Android setup complete!');
