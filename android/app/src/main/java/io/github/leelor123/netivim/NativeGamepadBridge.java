package io.github.leelor123.netivim;

import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.util.Locale;

/**
 * Fallback gamepad source for when the Android System WebView does not expose controllers
 * through navigator.getGamepads(). The page decides (NetivimPadNative.setForwarding) and only
 * then are controller KeyEvents / MotionEvents translated to the W3C "standard" layout and
 * pushed to window.__netivimPad.s(...). While forwarding is off nothing is consumed or sent, so
 * the normal WebView gamepad path and all touch / keyboard input are untouched.
 */
public class NativeGamepadBridge {

    // Standard-mapping button indices (same numbers as BTN in src/core/input/gamepad.ts).
    private static final int B_SOUTH = 0, B_EAST = 1, B_WEST = 2, B_NORTH = 3;
    private static final int B_LB = 4, B_RB = 5, B_LT = 6, B_RT = 7;
    private static final int B_SELECT = 8, B_START = 9, B_L3 = 10, B_R3 = 11;
    private static final int B_UP = 12, B_DOWN = 13, B_LEFT = 14, B_RIGHT = 15, B_HOME = 16;

    private final WebView webView;
    private volatile boolean forwarding = false;

    // Current controller state (touched on the UI thread only, except via the JS interface reads).
    private int buttons = 0;
    private int hatButtons = 0;
    private final float[] axes = new float[4];
    private float lt = 0f;
    private float rt = 0f;
    private String lastSent = "";

    public NativeGamepadBridge(WebView webView) {
        this.webView = webView;
    }

    /** True when the event comes from a physical controller (not a keyboard, mouse or screen). */
    public static boolean isGamepadSource(int source) {
        return (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
            || (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    // ---- called by the page (WebView background thread) ----

    /** Whether any controller device is attached. Cheap; the page polls it about once a second. */
    @JavascriptInterface
    public boolean hasGamepad() {
        for (int id : InputDevice.getDeviceIds()) {
            InputDevice d = InputDevice.getDevice(id);
            if (d != null && isGamepadSource(d.getSources())) return true;
        }
        return false;
    }

    /** The page turns forwarding on only when navigator.getGamepads() reports no controller. */
    @JavascriptInterface
    public void setForwarding(boolean on) {
        forwarding = on;
    }

    // ---- called by MainActivity (UI thread) ----

    /** Returns true when the key event was consumed (forwarding on and it is a controller event). */
    public boolean onKey(KeyEvent e) {
        if (!forwarding || !isGamepadSource(e.getSource())) return false;
        int bit = mapKey(e.getKeyCode());
        if (bit < 0) return false;
        boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
        if (e.getAction() != KeyEvent.ACTION_DOWN && e.getAction() != KeyEvent.ACTION_UP) return true;
        if (down) buttons |= (1 << bit);
        else buttons &= ~(1 << bit);
        push();
        return true;
    }

    /** Returns true when the motion event was consumed. */
    public boolean onMotion(MotionEvent e) {
        if (!forwarding || !isGamepadSource(e.getSource()) || e.getAction() != MotionEvent.ACTION_MOVE) {
            return false;
        }
        axes[0] = e.getAxisValue(MotionEvent.AXIS_X);
        axes[1] = e.getAxisValue(MotionEvent.AXIS_Y);
        axes[2] = e.getAxisValue(MotionEvent.AXIS_Z);
        axes[3] = e.getAxisValue(MotionEvent.AXIS_RZ);
        lt = Math.max(e.getAxisValue(MotionEvent.AXIS_LTRIGGER), e.getAxisValue(MotionEvent.AXIS_BRAKE));
        rt = Math.max(e.getAxisValue(MotionEvent.AXIS_RTRIGGER), e.getAxisValue(MotionEvent.AXIS_GAS));
        float hx = e.getAxisValue(MotionEvent.AXIS_HAT_X);
        float hy = e.getAxisValue(MotionEvent.AXIS_HAT_Y);
        hatButtons = 0;
        if (hx < -0.5f) hatButtons |= (1 << B_LEFT);
        if (hx > 0.5f) hatButtons |= (1 << B_RIGHT);
        if (hy < -0.5f) hatButtons |= (1 << B_UP);
        if (hy > 0.5f) hatButtons |= (1 << B_DOWN);
        push();
        return true;
    }

    /** Maps an Android key code to a standard button index, or -1 if it is not a controller button. */
    private static int mapKey(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_BUTTON_A: return B_SOUTH;
            // Some pads report their B / east button as Back; treat it as B so Back never exits.
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_BUTTON_B: return B_EAST;
            case KeyEvent.KEYCODE_BUTTON_X: return B_WEST;
            case KeyEvent.KEYCODE_BUTTON_Y: return B_NORTH;
            case KeyEvent.KEYCODE_BUTTON_L1: return B_LB;
            case KeyEvent.KEYCODE_BUTTON_R1: return B_RB;
            case KeyEvent.KEYCODE_BUTTON_L2: return B_LT;
            case KeyEvent.KEYCODE_BUTTON_R2: return B_RT;
            case KeyEvent.KEYCODE_BUTTON_SELECT: return B_SELECT;
            case KeyEvent.KEYCODE_BUTTON_START: return B_START;
            case KeyEvent.KEYCODE_BUTTON_THUMBL: return B_L3;
            case KeyEvent.KEYCODE_BUTTON_THUMBR: return B_R3;
            case KeyEvent.KEYCODE_DPAD_UP: return B_UP;
            case KeyEvent.KEYCODE_DPAD_DOWN: return B_DOWN;
            case KeyEvent.KEYCODE_DPAD_LEFT: return B_LEFT;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return B_RIGHT;
            case KeyEvent.KEYCODE_BUTTON_MODE: return B_HOME;
            default: return -1;
        }
    }

    /** Sends the state to the page, only when it changed. */
    private void push() {
        String s = String.format(Locale.US, "%d,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f",
            buttons | hatButtons, axes[0], axes[1], axes[2], axes[3], lt, rt);
        if (s.equals(lastSent)) return;
        lastSent = s;
        webView.evaluateJavascript("window.__netivimPad&&window.__netivimPad.s(" + s + ")", null);
    }
}
