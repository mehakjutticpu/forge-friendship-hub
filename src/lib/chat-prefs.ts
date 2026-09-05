export type ChatTheme = {
  id: string;
  name: string;
  bg: string;
  pattern: boolean;
  bubbleOut: string;
  bubbleOutFg: string;
  bubbleIn: string;
  bubbleInFg: string;
};

export const CHAT_THEMES: ChatTheme[] = [
  {
    id: "default",
    name: "Emerald",
    bg: "oklch(0.96 0.012 150)",
    pattern: true,
    bubbleOut: "oklch(0.87 0.08 155)",
    bubbleOutFg: "oklch(0.24 0.04 165)",
    bubbleIn: "oklch(1 0 0)",
    bubbleInFg: "oklch(0.24 0.03 250)",
  },
  {
    id: "midnight",
    name: "Midnight",
    bg: "oklch(0.22 0.03 260)",
    pattern: true,
    bubbleOut: "oklch(0.44 0.11 265)",
    bubbleOutFg: "oklch(0.97 0.01 260)",
    bubbleIn: "oklch(0.3 0.03 260)",
    bubbleInFg: "oklch(0.96 0.01 260)",
  },
  {
    id: "sunset",
    name: "Sunset",
    bg: "oklch(0.95 0.03 60)",
    pattern: false,
    bubbleOut: "oklch(0.82 0.11 55)",
    bubbleOutFg: "oklch(0.28 0.06 45)",
    bubbleIn: "oklch(1 0 0)",
    bubbleInFg: "oklch(0.28 0.04 45)",
  },
  {
    id: "ocean",
    name: "Ocean",
    bg: "oklch(0.95 0.025 230)",
    pattern: true,
    bubbleOut: "oklch(0.8 0.09 235)",
    bubbleOutFg: "oklch(0.24 0.06 250)",
    bubbleIn: "oklch(1 0 0)",
    bubbleInFg: "oklch(0.24 0.04 250)",
  },
  {
    id: "rose",
    name: "Rose",
    bg: "oklch(0.96 0.025 350)",
    pattern: false,
    bubbleOut: "oklch(0.84 0.09 350)",
    bubbleOutFg: "oklch(0.28 0.07 350)",
    bubbleIn: "oklch(1 0 0)",
    bubbleInFg: "oklch(0.26 0.04 340)",
  },
  {
    id: "graphite",
    name: "Graphite",
    bg: "oklch(0.17 0.005 250)",
    pattern: false,
    bubbleOut: "oklch(0.36 0.01 250)",
    bubbleOutFg: "oklch(0.97 0 0)",
    bubbleIn: "oklch(0.25 0.005 250)",
    bubbleInFg: "oklch(0.95 0 0)",
  },
  {
    id: "sand",
    name: "Sand",
    bg: "oklch(0.95 0.02 85)",
    pattern: true,
    bubbleOut: "oklch(0.86 0.07 95)",
    bubbleOutFg: "oklch(0.3 0.05 85)",
    bubbleIn: "oklch(1 0 0)",
    bubbleInFg: "oklch(0.28 0.03 85)",
  },
  {
    id: "violet",
    name: "Violet",
    bg: "oklch(0.95 0.03 300)",
    pattern: false,
    bubbleOut: "oklch(0.8 0.11 300)",
    bubbleOutFg: "oklch(0.26 0.07 300)",
    bubbleIn: "oklch(1 0 0)",
    bubbleInFg: "oklch(0.26 0.04 300)",
  },
  {
    id: "forest",
    name: "Forest",
    bg: "oklch(0.24 0.04 155)",
    pattern: true,
    bubbleOut: "oklch(0.42 0.09 155)",
    bubbleOutFg: "oklch(0.97 0.01 155)",
    bubbleIn: "oklch(0.3 0.03 155)",
    bubbleInFg: "oklch(0.96 0.01 155)",
  },
  {
    id: "mono",
    name: "Paper",
    bg: "oklch(0.99 0 0)",
    pattern: false,
    bubbleOut: "oklch(0.9 0 0)",
    bubbleOutFg: "oklch(0.2 0 0)",
    bubbleIn: "oklch(0.96 0 0)",
    bubbleInFg: "oklch(0.2 0 0)",
  },
];

export type ThreadPrefs = {
  themeId: string;
  customBg?: string;
  customOut?: string;
  fontScale?: number;
};

const THREAD_KEY = (me: string, peer: string) => `srt-theme-${me}-${peer}`;
const NICK_KEY = (me: string) => `srt-nicknames-${me}`;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function getThreadPrefs(me: string, peer: string): ThreadPrefs {
  return read<ThreadPrefs>(THREAD_KEY(me, peer), { themeId: "default", fontScale: 1 });
}

export function saveThreadPrefs(me: string, peer: string, prefs: ThreadPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(THREAD_KEY(me, peer), JSON.stringify(prefs));
}

export function themeById(id: string) {
  return CHAT_THEMES.find((t) => t.id === id) ?? CHAT_THEMES[0]!;
}

export function resolveTheme(prefs: ThreadPrefs): ChatTheme {
  const base = themeById(prefs.themeId);
  return {
    ...base,
    ...(prefs.customBg ? { bg: prefs.customBg } : {}),
    ...(prefs.customOut ? { bubbleOut: prefs.customOut } : {}),
  };
}

export function getNicknames(me: string): Record<string, string> {
  return read<Record<string, string>>(NICK_KEY(me), {});
}

export function setNickname(me: string, peer: string, nickname: string) {
  if (typeof window === "undefined") return;
  const all = getNicknames(me);
  if (nickname.trim()) all[peer] = nickname.trim();
  else delete all[peer];
  localStorage.setItem(NICK_KEY(me), JSON.stringify(all));
  window.dispatchEvent(new Event("srt-nicknames"));
}
