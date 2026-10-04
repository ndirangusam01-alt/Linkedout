// Design tokens for LinkedOut — now backed by CSS custom properties
// (defined in app/globals.css) rather than literal hex values, so that
// toggling light/dark/system in Settings changes every component
// instantly, everywhere, with zero React re-renders: the browser just
// re-resolves the CSS variables when <html data-theme="..."> changes.
// Components keep importing C exactly as before — nothing about how C is
// *used* changes, only how its values are produced.
export const C = {
  ink: "var(--lo-ink)",
  surface: "var(--lo-surface)",
  surface2: "var(--lo-surface2)",
  line: "var(--lo-line)",
  paper: "var(--lo-paper)",
  corpblue: "var(--lo-corpblue)",
  flag: "var(--lo-flag)",
  green: "var(--lo-green)",
  mustard: "var(--lo-mustard)",
  text: "var(--lo-text)",
  muted: "var(--lo-muted)",
};

// A theme-aware translucent "sunken" panel background (interview horror
// stories, resume-roast lines, brutal-honesty callouts) — replaces the
// old hardcoded "#0000002a", which only ever looked right in dark mode.
export const sunken = "var(--lo-sunken)";

// The subtle dot-grain texture behind the whole app also needs a
// theme-aware color (white dots read as noise on dark backgrounds;
// they'd nearly vanish, or look wrong, on a light one).
export const grainDot = "var(--lo-grain)";

// Alpha-blended variant of a token — e.g. alpha(C.mustard, 33) for what
// used to be written as `${C.mustard}55` back when C held literal hex
// strings. Needed because C's values are CSS variables now; you can't
// hex-suffix a var() reference the way you could a literal color.
// opacityPct is 0-100.
export function alpha(cssVar, opacityPct) {
  return `color-mix(in srgb, ${cssVar} ${opacityPct}%, transparent)`;
}

export const displayFont = {
  fontFamily: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
  fontWeight: 900,
  letterSpacing: "-0.02em",
};

export const monoFont = {
  fontFamily: "'IBM Plex Mono','SFMono-Regular',Consolas,Menlo,monospace",
};
