/**
 * Contracts for deterministic confidence scoring.
 */

import type { CanonicalProfile } from "../../types/canonical-profile.js";

/**
 * Deterministic confidence scorer contract.
 */
export interface ConfidenceScorer {
  /**
   * Stable scorer identifier.
   */
  readonly id: string;
  /**
   * Recomputes field and overall confidence without mutating input profile.
   */
  score(profile: CanonicalProfile): CanonicalProfile;
}
