# Keep the WebView and its JavaScript interface working after minification.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.publiccinema.app.** { *; }