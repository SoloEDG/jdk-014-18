import type { Panel } from "../../../shared/document";
import {
  ACTION_LABELS,
  SOUND_LABELS,
  SOUND_SHORT,
  panelAction,
  panelTransition,
  transitionLabel,
} from "../../../shared/sound";
import type { SceneAudio } from "./engine";

/** What the current shot asks the engine to do. */
export function sceneFor(panel: Panel | undefined): SceneAudio {
  return {
    sound: panel?.sound ?? "rain",
    transition: panelTransition(panel),
    action: panelAction(panel),
  };
}

export function cueFor(panel: Panel | undefined) {
  const sound = panel?.sound ?? "rain",
    transition = panelTransition(panel),
    action = panelAction(panel);
  return {
    title: SOUND_LABELS[sound],
    short: SOUND_SHORT[sound],
    kind: sound,
    transition,
    transitionLabel: transitionLabel(transition),
    action,
    actionLabel: action ? ACTION_LABELS[action] : "",
    speaker: panel?.speaker ?? "旁白",
    text: panel?.dialogue ?? "请选择一个分镜",
    hasDialogue: Boolean(panel?.dialogue?.trim()),
  };
}
