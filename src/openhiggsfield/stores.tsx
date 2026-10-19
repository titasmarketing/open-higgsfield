"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { createHistoryStore, type RunRecord } from "./history";
import type { Synced } from "./sync";
import { createUploadsStore, type UploadRecord } from "./uploads";

interface Stores {
  history: Synced<RunRecord>;
  uploads: Synced<UploadRecord>;
}

const StoresContext = createContext<Stores | null>(null);

/** The studio's shelves belong to whoever is signed in, so everything below
    reads them from here instead of from the browser at large. */
export function StoresProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const stores = useMemo<Stores>(
    () => ({ history: createHistoryStore(userId), uploads: createUploadsStore(userId) }),
    [userId],
  );
  return <StoresContext.Provider value={stores}>{children}</StoresContext.Provider>;
}

export function useStores(): Stores {
  const stores = useContext(StoresContext);
  if (!stores) throw new Error("useStores needs a StoresProvider");
  return stores;
}
