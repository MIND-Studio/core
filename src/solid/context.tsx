"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SolidClient } from "./create-client";

const SolidClientContext = createContext<SolidClient | null>(null);

/**
 * Provides the app's single {@link SolidClient} to the hooks and components in
 * this module. Mount once near the root of each app.
 */
export function MindSolidProvider({
  client,
  children,
}: {
  client: SolidClient;
  children: ReactNode;
}) {
  return (
    <SolidClientContext.Provider value={client}>
      {children}
    </SolidClientContext.Provider>
  );
}

/** Read the ambient {@link SolidClient}. Throws if no provider is mounted. */
export function useSolidClient(): SolidClient {
  const client = useContext(SolidClientContext);
  if (!client) {
    throw new Error("useSolidClient() must be called inside a <MindSolidProvider>.");
  }
  return client;
}
