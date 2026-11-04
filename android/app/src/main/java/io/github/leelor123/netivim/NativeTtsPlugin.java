package io.github.leelor123.netivim;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Hebrew narration through the phone's own text-to-speech engine. The Android System WebView
 * has no Web Speech synthesis, so the page (src/platform/nativeTts.ts) speaks through this
 * plugin instead. Only on-device voices are used: the app has no INTERNET permission and a
 * voice that needs the network is never chosen.
 *
 * JS API: isAvailable() -> { available }, speak({ text, rate, volume, id }), stop().
 * Events: "start", "done", "error", each with { id } (the utterance id given to speak).
 */
@CapacitorPlugin(name = "NetivimTts")
public class NativeTtsPlugin extends Plugin {

    private static final int STATE_INIT = 0;
    private static final int STATE_READY = 1;
    private static final int STATE_FAILED = 2;
    /** Give up on an engine that never answers its init callback. */
    private static final long INIT_TIMEOUT_MS = 10000;
    /** he-IL first, then the legacy "iw" code and the bare language. */
    private static final Locale[] HEBREW = {
        Locale.forLanguageTag("he-IL"), Locale.forLanguageTag("iw-IL"),
        Locale.forLanguageTag("iw"), Locale.forLanguageTag("he"),
    };

    private final Object lock = new Object();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<PluginCall> pendingAvailability = new ArrayList<>();
    private TextToSpeech tts;
    private int state = STATE_INIT;
    /** Bumped on every engine (re)start; callbacks from an older engine are ignored. */
    private int generation = 0;
    /** The chosen offline Hebrew voice; null when none is installed. */
    private Voice voice;

    @Override
    public void load() {
        startEngine();
    }

    private void startEngine() {
        final int gen;
        synchronized (lock) {
            gen = ++generation;
            state = STATE_INIT;
            voice = null;
        }
        TextToSpeech engine;
        try {
            // Binds to the engine service; onInit arrives later (or at once, with ERROR).
            engine = new TextToSpeech(getContext().getApplicationContext(), status -> onEngineInit(gen, status));
        } catch (RuntimeException e) {
            engine = null;
        }
        synchronized (lock) {
            if (gen != generation) {
                if (engine != null) engine.shutdown();
                return;
            }
            tts = engine;
            if (engine == null) {
                finishInit(STATE_FAILED);
                return;
            }
        }
        main.postDelayed(() -> {
            synchronized (lock) {
                if (gen == generation && state == STATE_INIT) finishInit(STATE_FAILED);
            }
        }, INIT_TIMEOUT_MS);
    }

    private void onEngineInit(int gen, int status) {
        synchronized (lock) {
            if (gen != generation || state != STATE_INIT) return;
            // An immediate ERROR can arrive inside the constructor, before tts is assigned.
            if (status != TextToSpeech.SUCCESS || tts == null) {
                finishInit(STATE_FAILED);
                return;
            }
            tts.setOnUtteranceProgressListener(new Listener());
            voice = pickVoice(tts);
            finishInit(STATE_READY);
        }
    }

    /** Sets the final init state and answers every isAvailable() call that waited for it. */
    private void finishInit(int newState) {
        state = newState;
        JSObject result = availability();
        for (PluginCall call : pendingAvailability) call.resolve(result);
        pendingAvailability.clear();
    }

    private JSObject availability() {
        JSObject o = new JSObject();
        o.put("available", state == STATE_READY && voice != null);
        o.put("ready", state == STATE_READY);
        return o;
    }

    /** Best on-device Hebrew voice, or null. Never one that needs the network. */
    private static Voice pickVoice(TextToSpeech engine) {
        Voice best = null;
        int bestScore = -1;
        Set<Voice> voices = null;
        try {
            voices = engine.getVoices();
        } catch (RuntimeException e) {
            // Some engines throw here; fall through to the per-language check.
        }
        if (voices != null) {
            for (Voice v : voices) {
                int s = score(v);
                if (s > bestScore) {
                    best = v;
                    bestScore = s;
                }
            }
        }
        if (best != null) return best;
        // Engines that list no voices: ask for the language and take the voice it settles on.
        for (Locale l : HEBREW) {
            try {
                if (engine.isLanguageAvailable(l) < TextToSpeech.LANG_AVAILABLE) continue;
                if (engine.setLanguage(l) < TextToSpeech.LANG_AVAILABLE) continue;
                Voice v = engine.getVoice();
                if (score(v) >= 0) return v;
            } catch (RuntimeException e) {
                // Try the next locale.
            }
        }
        return null;
    }

    /** -1 for anything that is not an installed, offline Hebrew voice; higher is better. */
    private static int score(Voice v) {
        if (v == null || v.getLocale() == null) return -1;
        String lang = v.getLocale().getLanguage();
        if (!"he".equals(lang) && !"iw".equals(lang)) return -1;
        if (v.isNetworkConnectionRequired()) return -1;
        Set<String> features = v.getFeatures();
        if (features != null && features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) return -1;
        int s = 1;
        if ("IL".equalsIgnoreCase(v.getLocale().getCountry())) s += 10;
        // QUALITY_VERY_LOW = 100 ... QUALITY_VERY_HIGH = 500.
        s += Math.max(0, Math.min(5, v.getQuality() / 100));
        return s;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        synchronized (lock) {
            if (state == STATE_INIT) {
                pendingAvailability.add(call);
                return;
            }
            // Re-read the voice list: the player may have installed a voice since.
            if (state == STATE_READY && voice == null && tts != null) voice = pickVoice(tts);
            call.resolve(availability());
        }
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        String id = call.getString("id", "");
        double rate = call.getDouble("rate", 1.0);
        double volume = call.getDouble("volume", 1.0);
        synchronized (lock) {
            // Nothing is queued before the engine is ready: the call fails and the page stays silent.
            if (state != STATE_READY || tts == null) {
                call.reject("Text-to-speech is not ready", "NOT_READY");
                return;
            }
            if (voice == null) {
                call.reject("No offline Hebrew voice is installed", "NO_VOICE");
                return;
            }
            if (text == null || text.isEmpty()) {
                call.reject("Empty text", "EMPTY");
                return;
            }
            int max = TextToSpeech.getMaxSpeechInputLength();
            if (text.length() > max) text = text.substring(0, max);
            try {
                tts.setVoice(voice);
                tts.setSpeechRate((float) clamp(rate, 0.25, 4.0));
                Bundle params = new Bundle();
                params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, (float) clamp(volume, 0.0, 1.0));
                if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, id) != TextToSpeech.SUCCESS) {
                    call.reject("speak failed", "SPEAK_FAILED");
                    return;
                }
            } catch (RuntimeException e) {
                call.reject("speak failed", "SPEAK_FAILED", e);
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopSpeech();
        call.resolve();
    }

    private void stopSpeech() {
        synchronized (lock) {
            if (state == STATE_READY && tts != null) {
                try {
                    tts.stop();
                } catch (RuntimeException e) {
                    // Stopping must never crash the app.
                }
            }
        }
    }

    @Override
    protected void handleOnPause() {
        stopSpeech();
    }

    @Override
    protected void handleOnResume() {
        // Back from the phone's TTS settings with a new Hebrew voice: a fresh engine sees it.
        boolean restart = false;
        synchronized (lock) {
            if (state == STATE_READY && voice == null && tts != null) {
                voice = pickVoice(tts);
                restart = voice == null;
            }
            if (restart) {
                tts.shutdown();
                tts = null;
            }
        }
        if (restart) startEngine();
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (lock) {
            generation++;
            if (tts != null) {
                try {
                    tts.shutdown();
                } catch (RuntimeException e) {
                    // Already gone.
                }
                tts = null;
            }
            voice = null;
            finishInit(STATE_FAILED);
        }
        main.removeCallbacksAndMessages(null);
    }

    private static double clamp(double v, double lo, double hi) {
        if (Double.isNaN(v)) return hi;
        return Math.max(lo, Math.min(hi, v));
    }

    private void emit(String event, String id) {
        JSObject o = new JSObject();
        o.put("id", id == null ? "" : id);
        notifyListeners(event, o);
    }

    /** Engine callbacks (binder thread) mapped to the page's events. */
    private class Listener extends UtteranceProgressListener {
        @Override
        public void onStart(String utteranceId) {
            emit("start", utteranceId);
        }

        @Override
        public void onDone(String utteranceId) {
            emit("done", utteranceId);
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onError(String utteranceId) {
            emit("error", utteranceId);
        }

        @Override
        public void onError(String utteranceId, int errorCode) {
            emit("error", utteranceId);
        }

        @Override
        public void onStop(String utteranceId, boolean interrupted) {
            // stop() or a flushing speak(): the page already moved on, but report the end anyway.
            emit("done", utteranceId);
        }
    }
}
