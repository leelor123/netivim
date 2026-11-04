package io.github.leelor123.netivim;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Fallback controller source for WebViews without a working Gamepad API (see the class doc).
    private NativeGamepadBridge padBridge;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge is built in super.onCreate.
        registerPlugin(NativeTtsPlugin.class);
        super.onCreate(savedInstanceState);
        // Keep the screen awake while the game is in the foreground.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        enterImmersiveMode();
        if (getBridge() != null && getBridge().getWebView() != null) {
            padBridge = new NativeGamepadBridge(getBridge().getWebView());
            getBridge().getWebView().addJavascriptInterface(padBridge, "NetivimPadNative");
        }
    }

    // Controller events go to the bridge first; it only consumes them while the page asked for it.
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (padBridge != null && padBridge.onKey(event)) return true;
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        if (padBridge != null && padBridge.onMotion(event)) return true;
        return super.dispatchGenericMotionEvent(event);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Android re-shows the bars after dialogs, app switches and swipes; hide them again.
        if (hasFocus) enterImmersiveMode();
    }

    @Override
    public void onResume() {
        super.onResume();
        enterImmersiveMode();
    }

    private void enterImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
