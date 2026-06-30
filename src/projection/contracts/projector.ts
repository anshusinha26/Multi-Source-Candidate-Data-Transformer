/**
 * Contracts for deterministic canonical-profile projection.
 */

import type { CanonicalProfile } from "../../types/canonical-profile.js";
import type { ProjectionConfig } from "../../types/projection-config.js";

/**
 * Allowed recursive projected output value.
 */
export type ProjectedOutputValue =
  | string
  | number
  | boolean
  | null
  | readonly ProjectedOutputValue[]
  | {
      readonly [key: string]: ProjectedOutputValue;
    };

/**
 * Generic projected output payload.
 */
export type ProjectedOutput = Readonly<Record<string, ProjectedOutputValue>>;

/**
 * Projector contract.
 */
export interface Projector {
  /**
   * Stable projector identifier.
   */
  readonly id: string;
  /**
   * Projects canonical profile to runtime-configured output shape.
   */
  project(profile: CanonicalProfile, config: ProjectionConfig): ProjectedOutput;
}
