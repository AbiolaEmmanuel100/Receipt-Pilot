"use client";
import { useSyncExternalStore } from "react";

export function useStore<T>(store: { get: () => T; subscribe: (l: (v: T) => void) => () => void }): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
