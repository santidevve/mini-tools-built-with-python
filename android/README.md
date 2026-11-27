# Public Cinema — Android WebView APK

A native Android **WebView** wrapper that loads the deployed Public Cinema PWA, so the
web app can be installed as an APK on phones and on **Google TV / Android TV**
(the manifest declares the `LEANBACK_LAUNCHER` category and a TV banner).

The actual movie catalog, streaming, and downloads are served by the Flask app; the APK
is a thin shell that points at its URL.

## Prerequisites (auto-installed by the script)

`build_apk.ps1` downloads a portable toolchain into `%TEMP%\kilo\android-build`:

- JDK 17 (Eclipse Temurin)
- Gradle 8.2
- Android SDK command-line tools + `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`

No global install or admin rights required. Re-runs reuse the cached downloads.

## Configure the app URL

Edit `gradle.properties` and set `START_URL` to your hosted app (HTTPS recommended, e.g.
your Vercel deployment):

```properties
START_URL=https://your-app.vercel.app
```

`http://` also works for local/LAN testing because `usesCleartextTraffic` is enabled.

## Build the APK

```powershell
cd android
./build_apk.ps1
```

On success the debug APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Install on a device

- **Phone / TV with USB**: enable USB debugging, then
  `adb install app/build/outputs/apk/debug/app-debug.apk`
- **Google TV / Android TV**: copy the APK to the device (or use `adb` over the network)
  and open it with a file manager / "Install from unknown apps".
- Sideloading on phones: transfer the APK and tap it to install.

## Notes

- This is a debug build (debuggable, unsigned with the debug keystore). For Play Store
  distribution, build a signed release (`gradle assembleRelease`) and generate a signing
  config.
- The WebView keeps `archive.org` media in-app and opens external links in the browser.
- Back navigation walks the WebView history.
- To change the launcher name/icon, edit `res/values/strings.xml` and the drawables under
  `res/drawable/`.