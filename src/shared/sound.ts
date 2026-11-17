import type {
  ActionCue,
  Panel,
  PanelTransition,
  Soundscape,
} from "./document";

export const SOUND_LABELS: Record<Soundscape, string> = {
  rain: "雨夜 · 城市白噪音",
  pulse: "电波 · 低频脉冲",
  wind: "远处 · 海岸风声",
};

export const SOUND_SHORT: Record<Soundscape, string> = {
  rain: "雨声",
  pulse: "电波",
  wind: "风声",
};

export const ACTION_LABELS: Record<ActionCue, string> = {
  steps: "脚步",
  door: "门扉",
  chime: "提示音",
  thunder: "闷雷",
  splash: "水花",
};

const TRANSITION_IDS: Record<PanelTransition, true> = {
  continue: true,
  fade: true,
  cut: true,
};

export const TRANSITIONS: {
  value: PanelTransition;
  label: string;
  hint: string;
}[] = [
  { value: "continue", label: "延续", hint: "旧声景留尾，新声景淡入，听感不断流" },
  { value: "fade", label: "渐变", hint: "旧声景淡出，新声景淡入" },
  { value: "cut", label: "切断", hint: "立即切换到新声景" },
];

/** Documents saved before these fields existed read them as defaults. */
export function panelTransition(panel: Panel | undefined): PanelTransition {
  const value = panel?.transition;
  return value && Object.prototype.hasOwnProperty.call(TRANSITION_IDS, value)
    ? value
    : "continue";
}

export function panelAction(panel: Panel | undefined): ActionCue | null {
  const value = panel?.action;
  return value && Object.prototype.hasOwnProperty.call(ACTION_LABELS, value)
    ? value
    : null;
}

export function transitionLabel(value: PanelTransition) {
  return TRANSITIONS.find((t) => t.value === value)?.label ?? "延续";
}

export function volumeLabel(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
