import {
  getSolidDataset,
  saveSolidDatasetAt,
  type SolidDataset,
} from "@inrupt/solid-client";

/** The DPoP-bound fetch from a browser Inrupt session (or undefined = public). */
export type PodFetch = typeof globalThis.fetch | null | undefined;

/** Read a Solid dataset. Throws on network/4xx/5xx (callers decide fallback). */
export async function readResource(
  url: string,
  podFetch?: PodFetch,
): Promise<SolidDataset> {
  return getSolidDataset(url, podFetch ? { fetch: podFetch } : undefined);
}

/** Write (PUT) a Solid dataset. CSS auto-creates intermediate containers. */
export async function writeResource(
  url: string,
  dataset: SolidDataset,
  podFetch?: PodFetch,
): Promise<SolidDataset> {
  return saveSolidDatasetAt(url, dataset, podFetch ? { fetch: podFetch } : undefined);
}

/** Derive the pod root (origin + first path segment) from a WebID. */
export function podRootFromWebId(webId: string): string {
  const u = new URL(webId);
  const seg = u.pathname.split("/").filter(Boolean)[0];
  return seg ? `${u.origin}/${seg}/` : `${u.origin}/`;
}
