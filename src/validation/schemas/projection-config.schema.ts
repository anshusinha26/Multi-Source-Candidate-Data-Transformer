/**
 * Runtime validation schemas for projection configuration domain models.
 */

import { z } from "zod";
import { parsePath } from "../../projection/path-resolver.js";
import type { ProjectionConfig } from "../../types/projection-config.js";

const createResolverAlignedPathSchema = (
  allowWildcard: boolean,
  wildcardMessage: string
): z.ZodType<string> =>
  z
    .string()
    .min(1)
    .superRefine((value, ctx) => {
      const parsed = parsePath(value);
      if (!parsed.ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: parsed.error.message
        });
        return;
      }

      if (!allowWildcard && parsed.value.hasWildcard) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: wildcardMessage
        });
      }
    });

/**
 * Projection output path syntax.
 */
export const ProjectionPathSchema = createResolverAlignedPathSchema(
  false,
  "Wildcard is not allowed in projection output path."
);

/**
 * Projection source path syntax.
 */
export const ProjectionSourcePathSchema = createResolverAlignedPathSchema(
  true,
  "Wildcard is allowed for source paths only."
);

/**
 * Validation schema for projection field type hints.
 */
export const ProjectionFieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "object",
  "string[]",
  "number[]",
  "boolean[]",
  "object[]"
]);

/**
 * Validation schema for projection normalization directives.
 */
export const ProjectionNormalizationSchema = z.enum([
  "E164",
  "YYYY-MM",
  "ISO-3166-alpha-2",
  "canonical"
]);

/**
 * Validation schema for missing value policy.
 */
export const OnMissingPolicySchema = z.enum(["null", "omit", "error"]);

/**
 * Shared projection field properties.
 */
export const ProjectionFieldBaseSchema = z
  .object({
    path: ProjectionPathSchema,
    type: ProjectionFieldTypeSchema,
    required: z.boolean(),
    normalize: z.array(ProjectionNormalizationSchema)
  })
  .strict();

/**
 * Validation schema for direct projection mapping.
 */
export const ProjectionFieldDirectSchema = ProjectionFieldBaseSchema.extend({
  mapping: z.literal("direct"),
  from: z.null()
}).strict();

/**
 * Validation schema for explicit remapped projection field.
 */
export const ProjectionFieldMappedSchema = ProjectionFieldBaseSchema.extend({
  mapping: z.literal("mapped"),
  from: ProjectionSourcePathSchema
}).strict();

/**
 * Validation schema for projection field entries.
 */
export const ProjectionFieldSchema = z.discriminatedUnion("mapping", [
  ProjectionFieldDirectSchema,
  ProjectionFieldMappedSchema
]);

/**
 * Projection config runtime validation schema.
 */
export const ProjectionConfigSchema = z
  .object({
    fields: z.array(ProjectionFieldSchema).min(1, "At least one projection field is required."),
    includeConfidence: z.boolean(),
    includeProvenance: z.boolean(),
    onMissing: OnMissingPolicySchema
  })
  .strict()
  .superRefine((value, ctx) => {
    const seenPaths = new Set<string>();

    value.fields.forEach((field, index) => {
      if (seenPaths.has(field.path)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", index, "path"],
          message: `Duplicate projection path "${field.path}" is not allowed.`
        });
      }
      seenPaths.add(field.path);

      const duplicates = new Set<string>();
      field.normalize.forEach((directive, directiveIndex) => {
        if (duplicates.has(directive)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", index, "normalize", directiveIndex],
            message: `Duplicate normalize directive "${directive}" is not allowed.`
          });
        }
        duplicates.add(directive);
      });
    });
  });

/**
 * Inferred output type from projection config schema.
 */
export type ProjectionConfigSchemaOutput = z.output<typeof ProjectionConfigSchema>;

/**
 * Inferred input type for projection config schema.
 */
export type ProjectionConfigSchemaInput = z.input<typeof ProjectionConfigSchema>;

const _projectionConfigSchemaTypeCheck: z.ZodType<ProjectionConfig> = ProjectionConfigSchema;
void _projectionConfigSchemaTypeCheck;
