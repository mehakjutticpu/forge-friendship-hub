const KEY = "srt-gate-unlocked";

export function unlockGate() {
  if (typeof window !== "undefined") sessionStorage.setItem(KEY, "1");
}

export function isGateUnlocked() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(KEY) === "1";
}

export function lockGate() {
  if (typeof window !== "undefined") sessionStorage.removeItem(KEY);
}
