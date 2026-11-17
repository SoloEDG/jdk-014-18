<script setup lang="ts">
import type { ComicPage, Panel } from "../../../shared/document";
import { frameStyle } from "../lib/viewport";
import {
  ACTION_LABELS,
  SOUND_SHORT,
  panelAction,
  panelTransition,
  transitionLabel,
} from "../../../shared/sound";
defineProps<{ page: ComicPage; active: string }>();
const emit = defineEmits<{ select: [id: string] }>();
function ownership(panel: Panel) {
  const transition = panelTransition(panel),
    action = panelAction(panel);
  return {
    sound: SOUND_SHORT[panel.sound],
    transition: transition === "continue" ? "" : transitionLabel(transition),
    action: action ? ACTION_LABELS[action] : "",
  };
}
</script>
<template>
  <section class="panel-strip">
    <div class="section-heading">
      <span>分镜导航 <small>STORYBOARD</small></span
      ><span class="muted">{{ page.panels.length }} 个镜头</span>
    </div>
    <div class="panel-thumbs">
      <button
        v-for="(panel, i) in page.panels"
        :key="panel.id"
        :class="{ selected: active === panel.id }"
        @click="emit('select', panel.id)"
      >
        <div :style="frameStyle(page, panel, 'panel')"></div>
        <span
          ><b>{{ String(i + 1).padStart(2, "0") }}</b> {{ panel.speaker }}
          <small>{{ panel.duration }}s</small></span
        >
        <span class="shot-audio-badge">
          <i>{{ ownership(panel).sound }}</i>
          <em v-if="ownership(panel).transition">{{
            ownership(panel).transition
          }}</em>
          <em v-if="ownership(panel).action" class="action">{{
            ownership(panel).action
          }}</em>
        </span>
      </button>
    </div>
  </section>
</template>
