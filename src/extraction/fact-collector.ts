/**
 * Deterministic candidate-fact collection orchestration.
 */

import type { CandidateFact } from "../types/candidate-fact.js";
import type { ExtractionError } from "../types/errors.js";
import type { SourceRecord } from "../types/source-record.js";
import type { Extractor } from "./contracts/extractor.js";

/**
 * Inputs required by fact collector.
 */
export interface FactCollectorInput {
  /**
   * Source records to process.
   */
  readonly sources: readonly SourceRecord[];
  /**
   * Available extractors.
   */
  readonly extractors: readonly Extractor[];
}

/**
 * Fact collector output payload.
 */
export interface FactCollectorOutput {
  /**
   * Aggregated candidate facts in deterministic order.
   */
  readonly facts: readonly CandidateFact[];
  /**
   * Extraction errors captured per source/extractor.
   */
  readonly errors: readonly ExtractionError[];
}

const sortSourcesDeterministically = (sources: readonly SourceRecord[]): readonly SourceRecord[] =>
  [...sources].sort((left, right) => {
    if (left.sourceOrder !== right.sourceOrder) {
      return left.sourceOrder - right.sourceOrder;
    }
    const idCompare = left.sourceId.localeCompare(right.sourceId);
    if (idCompare !== 0) {
      return idCompare;
    }
    return left.kind.localeCompare(right.kind);
  });

const sortExtractorsDeterministically = (
  extractors: readonly Extractor[]
): readonly Extractor[] =>
  [...extractors].sort((left, right) => {
    const kindCompare = left.kind.localeCompare(right.kind);
    if (kindCompare !== 0) {
      return kindCompare;
    }
    return left.id.localeCompare(right.id);
  });

const sortFactsDeterministically = (facts: readonly CandidateFact[]): readonly CandidateFact[] =>
  [...facts].sort((left, right) => {
    if (left.sourceOrder !== right.sourceOrder) {
      return left.sourceOrder - right.sourceOrder;
    }
    if (left.extractionOrder !== right.extractionOrder) {
      return left.extractionOrder - right.extractionOrder;
    }
    const pathCompare = left.fieldPath.localeCompare(right.fieldPath);
    if (pathCompare !== 0) {
      return pathCompare;
    }
    return left.factId.localeCompare(right.factId);
  });

const cloneFactWithOrder = (fact: CandidateFact, extractionOrder: number): CandidateFact => ({
  ...fact,
  extractionOrder
});

/**
 * Collects facts from all compatible extractors without merging or deduplication.
 */
export const collectCandidateFacts = (input: FactCollectorInput): FactCollectorOutput => {
  const sortedSources = sortSourcesDeterministically(input.sources);
  const sortedExtractors = sortExtractorsDeterministically(input.extractors);

  const collectedFacts: CandidateFact[] = [];
  const collectedErrors: ExtractionError[] = [];
  let globalExtractionOrder = 1;

  for (const source of sortedSources) {
    const compatibleExtractors = sortedExtractors.filter((extractor) => extractor.kind === source.kind);

    for (const extractor of compatibleExtractors) {
      const extracted = extractor.extract(source);

      if (!extracted.ok) {
        collectedErrors.push(extracted.error);
        continue;
      }

      const sortedFacts = sortFactsDeterministically(extracted.value);
      for (const fact of sortedFacts) {
        collectedFacts.push(cloneFactWithOrder(fact, globalExtractionOrder));
        globalExtractionOrder += 1;
      }
    }
  }

  return {
    facts: collectedFacts,
    errors: collectedErrors
  };
};
