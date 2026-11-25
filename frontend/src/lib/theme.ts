/** Colour theme and surface style. index.html applies the stored values before first paint;
 *  these helpers change them at runtime and remember the choice. */
export type Theme = "light" | "dark" | "blue" | "green" | "neon";
export type Surface = "glass" | "solid";

export const THEMES: { id: Theme; bg: string; ink: string; accent: string }[] = [
  { id: "light", bg: "#F1F1ED", ink: "#33332F", accent: "#F07A22" },
  { id: "dark", bg: "#26282C", ink: "#F2F2EF", accent: "#FF9A4D" },
  { id: "blue", bg: "#EEF2F7", ink: "#16233A", accent: "#6F9BE6" },
  { id: "green", bg: "#EDF1EC", ink: "#1F2D26", accent: "#5FB088" },
  { id: "neon", bg: "#14121F", ink: "#8C9BFF", accent: "#FF7AB8" },
];

const store = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
};

export const getTheme = (): Theme => {
  const t = document.documentElement.dataset.theme as Theme | undefined;
  return THEMES.some((x) => x.id === t) ? t! : "light";
};

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  store("theme", t);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", THEMES.find((x) => x.id === t)!.bg);
}

export const getSurface = (): Surface => (document.documentElement.dataset.surface === "solid" ? "solid" : "glass");

export function setSurface(s: Surface) {
  document.documentElement.dataset.surface = s;
  store("surface", s);
}
