export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** The identity of a looping soundscape. Panels sharing a soundscape share one bed. */
export type Soundscape = "rain" | "pulse" | "wind";
/** How entering a panel treats the soundscape that is already running. */
export type PanelTransition = "continue" | "fade" | "cut";
/** Short, non-looping sounds owned by a single panel visit. */
export type ActionCue = "steps" | "door" | "chime" | "thunder" | "splash";
export interface Panel {
  id: string;
  rect: Rect;
  dialogue: string;
  speaker: string;
  sound: Soundscape;
  /** Defaults to "continue" for documents saved before this field existed. */
  transition?: PanelTransition;
  /** Defaults to no action cue. */
  action?: ActionCue | null;
  duration: number;
}
export interface ComicPage {
  id: string;
  title: string;
  image: string;
  width: number;
  height: number;
  panels: Panel[];
}
export interface Chapter {
  id: string;
  title: string;
  subtitle: string;
  pages: ComicPage[];
}
export interface ComicDocument {
  version: 1;
  id: string;
  title: string;
  author: string;
  chapters: Chapter[];
}
export interface ReadingLocation {
  chapterId: string;
  pageId: string;
  panelId: string;
  zoom: number;
  x: number;
  y: number;
}
export interface Bookmark {
  id: string;
  label: string;
  location: ReadingLocation;
  created: number;
}
export type ReadingMode = "page" | "panel";
