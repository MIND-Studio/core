import {
  buildThing,
  createSolidDataset,
  createThing,
  getInteger,
  getStringNoLocale,
  getThingAll,
  getUrlAll,
  removeThing,
  setThing,
  type SolidDataset,
} from "@inrupt/solid-client";
import { readResource, writeResource, type PodFetch } from "./pod-client";
import { DEFAULT_APPS, type AppEntry } from "./catalog";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const MIND_APP = "http://mind.example/voc#App";
const MIND_LABEL = "http://mind.example/voc#label";
const MIND_URL = "http://mind.example/voc#url";
const MIND_ICON = "http://mind.example/voc#icon";
const MIND_BLURB = "http://mind.example/voc#blurb";
const MIND_ORDER = "http://mind.example/voc#order";

function appsDocUrl(podRoot: string): string {
  return `${podRoot.replace(/\/?$/, "/")}home/apps.ttl`;
}

function entryThing(doc: string, a: AppEntry) {
  return buildThing(createThing({ url: `${doc}#${a.key}` }))
    .addUrl(RDF_TYPE, MIND_APP)
    .addStringNoLocale(MIND_LABEL, a.label)
    .addStringNoLocale(MIND_URL, a.url)
    .addStringNoLocale(MIND_ICON, a.icon)
    .addStringNoLocale(MIND_BLURB, a.blurb ?? "")
    .addInteger(MIND_ORDER, a.order)
    .build();
}

/** Read the launcher registry. Returns null if the file doesn't exist yet. */
export async function readApps(
  podRoot: string,
  podFetch?: PodFetch,
): Promise<AppEntry[] | null> {
  const doc = appsDocUrl(podRoot);
  let ds: SolidDataset;
  try {
    ds = await readResource(doc, podFetch);
  } catch {
    return null; // 404 → not seeded
  }
  const apps = getThingAll(ds)
    .filter((t) => getUrlAll(t, RDF_TYPE).includes(MIND_APP))
    .map((t) => ({
      key: t.url.split("#")[1] ?? t.url,
      label: getStringNoLocale(t, MIND_LABEL) ?? "App",
      url: getStringNoLocale(t, MIND_URL) ?? "#",
      icon: getStringNoLocale(t, MIND_ICON) ?? "📦",
      blurb: getStringNoLocale(t, MIND_BLURB) ?? "",
      order: getInteger(t, MIND_ORDER) ?? 999,
    }))
    .sort((a, b) => a.order - b.order);
  return apps;
}

/** Overwrite the whole registry with `apps`. */
export async function writeApps(
  podRoot: string,
  apps: AppEntry[],
  podFetch?: PodFetch,
): Promise<void> {
  const doc = appsDocUrl(podRoot);
  // Read-modify-write: reuse the existing dataset's resourceInfo so Inrupt does
  // a conditional UPDATE (If-Match) instead of a CREATE (If-None-Match: *) —
  // the latter 412s when apps.ttl already exists.
  let ds: SolidDataset;
  try {
    ds = await readResource(doc, podFetch);
    for (const t of getThingAll(ds)) {
      if (getUrlAll(t, RDF_TYPE).includes(MIND_APP)) ds = removeThing(ds, t);
    }
  } catch {
    ds = createSolidDataset();
  }
  for (const a of apps) ds = setThing(ds, entryThing(doc, a));
  await writeResource(doc, ds, podFetch);
}

/** Read the registry; if missing, seed it with DEFAULT_APPS and return those. */
export async function ensureSeeded(
  podRoot: string,
  podFetch?: PodFetch,
): Promise<AppEntry[]> {
  const existing = await readApps(podRoot, podFetch);
  if (existing) return existing;
  await writeApps(podRoot, DEFAULT_APPS, podFetch);
  return DEFAULT_APPS;
}
