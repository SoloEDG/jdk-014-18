import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef,
} from "vue";
import type {
  ActionCue,
  Panel,
  PanelTransition,
  Soundscape,
} from "../../../shared/document";
import { SoundscapeEngine, type MixLevels } from "../lib/engine";
import { cueFor, sceneFor } from "../lib/cues";

export function useAudio(panel: ComputedRef<Panel | undefined>) {
  const enabled = ref(false),
    volume = ref(0.35),
    dialogue = ref(true),
    duckDialogue = ref(true),
    mix = ref<MixLevels>({ ambience: 0.9, effects: 0.85, duck: 0.4 }),
    error = ref(""),
    activeBed = ref<Soundscape | null>(null),
    activeAction = ref<ActionCue | null>(null),
    decoding = ref(false);
  const cue = computed(() => cueFor(panel.value)),
    ducked = computed(
      () =>
        duckDialogue.value &&
        dialogue.value &&
        Boolean(panel.value?.dialogue?.trim()),
    );
  const engine = new SoundscapeEngine({
    onBed: (sound) => (activeBed.value = sound),
    onAction: (action) => (activeAction.value = action),
    onDecoding: (value) => (decoding.value = value),
    onError: (message) => (error.value = message),
  });
  engine.setVolume(volume.value);
  engine.setMix(mix.value);
  engine.setDucked(ducked.value);

  async function toggle() {
    if (enabled.value) {
      enabled.value = false;
      engine.disable();
      return;
    }
    enabled.value = true;
    error.value = "";
    engine.setVolume(volume.value);
    engine.setMix(mix.value);
    engine.setDucked(ducked.value);
    try {
      await engine.enable(sceneFor(panel.value));
    } catch {
      enabled.value = false;
      engine.disable();
      error.value = "浏览器未能启动声音，请再次点击播放";
    }
  }

  function setSound(sound: Soundscape) {
    if (panel.value) panel.value.sound = sound;
  }

  function setTransition(transition: PanelTransition) {
    if (panel.value) panel.value.transition = transition;
  }

  function setAction(action: ActionCue | null) {
    if (!panel.value) return;
    if (panel.value.action === action) return;
    panel.value.action = action;
    // Choosing a cue previews it immediately; clearing one silences anything
    // still queued or ringing from the shot that was just edited.
    if (action) audition();
    else engine.clearActions();
  }

  function audition() {
    if (panel.value?.action) {
      error.value = "";
      engine.audition(panel.value.action);
    }
  }

  /**
   * Re-enter the current shot. The soundscape itself keeps flowing; only the
   * shot's action cue is re-triggered, so it can be checked while editing.
   */
  function replay() {
    if (!enabled.value) return;
    error.value = "";
    void engine.enter(sceneFor(panel.value), false);
    if (panel.value?.action) engine.audition(panel.value.action);
  }

  /**
   * Browsers suspend audio when a tab is hidden or the device sleeps. On
   * return only the current shot is restored — skipped panels are never
   * replayed as a backlog of sounds.
   */
  function resume() {
    engine.resumeCurrent();
  }

  // Only a new shot or a new soundscape identity reaches the engine. Editing
  // the transition or an action cue previews without restarting the bed, and
  // a panel change made while paused starts nothing until sound comes back.
  watch(
    () => [panel.value?.id, panel.value?.sound] as const,
    () => {
      if (enabled.value) void engine.enter(sceneFor(panel.value));
    },
  );
  watch(volume, (value) => engine.setVolume(value));
  watch(mix, (value) => engine.setMix(value), { deep: true });
  watch(ducked, (value) => engine.setDucked(value));
  onBeforeUnmount(() => engine.dispose());

  return {
    enabled,
    volume,
    dialogue,
    duckDialogue,
    mix,
    error,
    cue,
    ducked,
    activeBed,
    activeAction,
    decoding,
    toggle,
    setSound,
    setTransition,
    setAction,
    audition,
    replay,
    resume,
  };
}
