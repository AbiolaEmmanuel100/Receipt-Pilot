import { getMeta, setMeta } from "./storage";
import { userId } from "./session";

// Port of js/activity.js
export interface Activity { at: string; action: string; number: string; userId: string }

export async function log(action: string, extra?: { number?: string }) {
  let list = await getMeta<Activity[]>("activity", []);
  if (!Array.isArray(list)) list = [];
  list.unshift({ at: new Date().toISOString(), action: String(action || ""), number: extra && extra.number ? String(extra.number) : "", userId: userId() || "" });
  await setMeta("activity", list.slice(0, 80));
}

export async function list(): Promise<Activity[]> {
  let rows = await getMeta<Activity[]>("activity", []);
  rows = Array.isArray(rows) ? rows : [];
  const uid = userId() || "";
  if (!uid) return rows.filter((r) => !r.userId);
  return rows.filter((r) => r.userId === uid);
}
