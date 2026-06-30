/**
 * Runtime validation schemas for projected output payloads.
 */

import { z } from "zod";
import { ProvenanceEntrySchema } from "./canonical-profile.schema.js";

/**
 * Scalar value allowed in projected output.
 */
export const ProjectedScalarSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

/**
 * Recursive JSON-like value schema for projected output fields.
 */
export const ProjectedValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([ProjectedScalarSchema, z.array(ProjectedValueSchema), z.record(z.string(), ProjectedValueSchema)])
);

/**
 * Generic projected output schema.
 * Intentionally extensible because projection fields are runtime-configured.
 */
export const ProjectedOutputSchema = z.record(z.string().min(1), ProjectedValueSchema);

/**
 * Optional metadata schema when projection includes confidence/provenance.
 */
export const ProjectedOutputMetadataSchema = z
  .object({
    overallConfidence: z.number().finite().min(0).max(1),
    provenance: z.array(ProvenanceEntrySchema)
  })
  .partial()
  .strict();

/**
 * Inferred output type from projected output schema.
 */
export type ProjectedOutputSchemaOutput = z.output<typeof ProjectedOutputSchema>;

/**
 * Inferred input type for projected output schema.
 */
export type ProjectedOutputSchemaInput = z.input<typeof ProjectedOutputSchema>;
