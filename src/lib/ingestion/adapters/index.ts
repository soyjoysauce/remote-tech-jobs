// The adapter registry. Layer 3b adds the ATS adapters here.
import { remoteOkAdapter } from "./remoteok";
import { remotiveAdapter } from "./remotive";

export const adapters = {
  remotive: remotiveAdapter,
  remoteok: remoteOkAdapter,
} as const;

export type AdapterId = keyof typeof adapters;

export const ADAPTER_IDS: readonly AdapterId[] = ["remotive", "remoteok"];
