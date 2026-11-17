<script setup lang="ts">
import { computed } from "vue";
import {
  AudioLines,
  Headphones,
  Layers,
  MessageSquare,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Volume2,
  Zap,
} from "lucide-vue-next";
import type {
  ActionCue,
  PanelTransition,
  Soundscape,
} from "../../../shared/document";
import {
  ACTION_LABELS,
  SOUND_LABELS,
  SOUND_SHORT,
  TRANSITIONS,
  volumeLabel,
} from "../../../shared/sound";
import type { MixLevels } from "../lib/engine";
const props = defineProps<{
  enabled: boolean;
  volume: number;
  dialogue: boolean;
  duckDialogue: boolean;
  mix: MixLevels;
  cue: {
    title: string;
    short: string;
    kind: Soundscape;
    transition: PanelTransition;
    transitionLabel: string;
    action: ActionCue | null;
    actionLabel: string;
    speaker: string;
    text: string;
    hasDialogue: boolean;
  };
  ducked: boolean;
  activeBed: Soundscape | null;
  activeAction: ActionCue | null;
  decoding: boolean;
  error: string;
}>();
const emit = defineEmits<{
  toggle: [];
  volume: [value: number];
  dialogue: [];
  duck: [];
  sound: [value: Soundscape];
  transition: [value: PanelTransition];
  action: [value: ActionCue | null];
  audition: [];
  replay: [];
  mix: [value: MixLevels];
}>();
const sounds = Object.keys(SOUND_LABELS) as Soundscape[],
  actions = Object.keys(ACTION_LABELS) as ActionCue[];
const status = computed(() => {
  if (!props.enabled) return "点击播放，进入故事";
  if (props.activeAction) return `正在播放 · ${ACTION_LABELS[props.activeAction]}`;
  if (props.decoding) return "正在准备动作音效…";
  return props.activeBed
    ? `正在播放 · ${SOUND_SHORT[props.activeBed]}循环`
    : "正在播放";
});
function setMix(key: keyof MixLevels, value: number) {
  emit("mix", { ...props.mix, [key]: value });
}
</script>

<template>
  <section class="audio-panel">
    <div class="section-heading">
      <span><Headphones :size="15" /> 声音与对白</span
      ><span class="live-label" :class="{ idle: !enabled }">{{
        enabled ? "LIVE" : "IDLE"
      }}</span>
    </div>
    <div class="sound-card">
      <div class="sound-icon"><Headphones :size="27" /></div>
      <h3>让故事，在耳边发生</h3>
      <p>声景随画面连续流动，动作音效落在镜头里</p>
      <div class="waveform" :class="{ playing: enabled }">
        <i
          v-for="i in 32"
          :key="i"
          :style="{
            height: `${8 + ((i * 13) % 29)}px`,
            animationDelay: `${i * 0.04}s`,
          }"
        ></i>
      </div>
      <div class="sound-track">
        <div>
          <strong>{{ activeBed ? SOUND_LABELS[activeBed] : cue.title }}</strong
          ><small>{{ status }}</small>
        </div>
        <button
          class="play-sound"
          :aria-label="enabled ? '暂停音效' : '播放音效'"
          @click="emit('toggle')"
        >
          <Pause v-if="enabled" :size="17" /><Play v-else :size="17" />
        </button>
      </div>
      <label class="volume"
        ><Volume2 :size="15" /><input
          aria-label="主音量"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="volume"
          @input="
            emit('volume', Number(($event.target as HTMLInputElement).value))
          "
        /><span>{{ volumeLabel(volume) }}</span></label
      >
    </div>

    <div class="shot-audio">
      <div class="audio-row-heading">
        <span><Layers :size="13" /> 本镜声音归属</span
        ><button
          class="replay-shot"
          :disabled="!enabled"
          title="从本镜开头重听"
          @click="emit('replay')"
        >
          <RotateCcw :size="12" /> 重听本镜
        </button>
      </div>
      <div class="sound-choices" role="group" aria-label="循环声景">
        <button
          v-for="sound in sounds"
          :key="sound"
          :class="{ active: cue.kind === sound }"
          :aria-pressed="cue.kind === sound"
          @click="emit('sound', sound)"
        >
          {{ SOUND_SHORT[sound] }}
          <small
            v-if="activeBed === sound && enabled"
            class="bed-live"
            aria-label="正在播放"
            >●</small
          >
        </button>
      </div>
      <p class="control-label">进入本镜时</p>
      <div class="transition-choices" role="group" aria-label="声景切换方式">
        <button
          v-for="option in TRANSITIONS"
          :key="option.value"
          :class="{ active: cue.transition === option.value }"
          :title="option.hint"
          :aria-pressed="cue.transition === option.value"
          @click="emit('transition', option.value)"
        >
          {{ option.label }}
        </button>
      </div>
      <p class="control-label">
        动作音效
        <small>{{
          cue.actionLabel ? `${cue.actionLabel} · 随镜头触发` : "本镜无"
        }}</small>
      </p>
      <div class="action-row">
        <select
          aria-label="动作音效"
          :value="cue.action ?? ''"
          @change="
            emit(
              'action',
              (($event.target as HTMLSelectElement).value || null) as ActionCue | null,
            )
          "
        >
          <option value="">无动作音效</option>
          <option v-for="action in actions" :key="action" :value="action">
            {{ ACTION_LABELS[action] }}
          </option>
        </select>
        <button
          class="audition"
          :disabled="!cue.action || !enabled"
          title="单独试听动作音效"
          @click="emit('audition')"
        >
          <Zap :size="12" /> 试听
        </button>
      </div>
    </div>

    <div class="mixer">
      <div class="audio-row-heading">
        <span><AudioLines :size="13" /> 声音层强度</span
      ><small>{{ ducked ? "环境声已为对白压低" : "环境声未压低" }}</small>
      </div>
      <label class="mix-row"
        >环境<input
          aria-label="环境声强度"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="mix.ambience"
          @input="
            setMix(
              'ambience',
              Number(($event.target as HTMLInputElement).value),
            )
          "
        /><span>{{ volumeLabel(mix.ambience) }}</span></label
      >
      <label class="mix-row"
        >动作<input
          aria-label="动作音效强度"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="mix.effects"
          @input="
            setMix('effects', Number(($event.target as HTMLInputElement).value))
          "
        /><span>{{ volumeLabel(mix.effects) }}</span></label
      >
      <label class="mix-row"
        >压低<input
          aria-label="对白时环境声压低幅度"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="mix.duck"
          @input="setMix('duck', Number(($event.target as HTMLInputElement).value))"
        /><span>{{ volumeLabel(mix.duck) }}</span></label
      >
    </div>

    <div class="dialogue-heading">
      <span><MessageSquare :size="14" /> 当前对白</span
      ><button
        class="toggle"
        :class="{ on: dialogue }"
        aria-label="显示对白"
        :aria-pressed="dialogue"
        @click="emit('dialogue')"
      >
        <i></i>
      </button>
    </div>
    <div v-if="dialogue" class="dialogue-card">
      <small>{{ cue.speaker }}</small>
      <p>“{{ cue.text }}”</p>
      <div class="dialogue-dots">● <span>● ●</span></div>
    </div>
    <p v-else class="muted">对白已隐藏</p>
    <button
      class="duck-toggle"
      :class="{ on: duckDialogue }"
      :aria-pressed="duckDialogue"
      :disabled="!cue.hasDialogue"
      @click="emit('duck')"
    >
      <Radio :size="12" />
      {{ duckDialogue ? "对白展开时压低环境声" : "环境声保持原强度" }}
    </button>
    <p v-if="error" role="alert" class="audio-error">{{ error }}</p>
    <div class="headphone-note">
      <Headphones :size="15" /><span
        >推荐佩戴耳机<br /><small>获得完整的沉浸阅读体验</small></span
      >
    </div>
  </section>
</template>
