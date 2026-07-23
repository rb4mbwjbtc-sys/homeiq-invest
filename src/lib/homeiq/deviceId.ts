// Anonyme Geräte-ID für Gäste (localStorage, damit Nutzungszähler pro Browser stabil bleibt).
const KEY = "homeiq.deviceId.v1";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    window.localStorage.setItem(KEY, id);
  }
  return id;
}
