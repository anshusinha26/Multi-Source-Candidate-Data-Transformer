/**
 * Commander command for end-to-end candidate transformation.
 */

import { Command } from "commander";
import type {
  PipelineRunnerInput,
  PipelineRunnerResult
} from "../../app/pipeline-runner.js";
import { parseTransformOptions, type TransformCommandRawOptions } from "../options.js";

/**
 * Dependencies required by transform CLI command.
 */
export interface TransformCommandDependencies {
  readonly runPipeline: (input: PipelineRunnerInput) => Promise<PipelineRunnerResult>;
  readonly writeTextFile: (path: string, content: string) => Promise<void>;
  readonly stdout?: NodeJS.WriteStream;
  readonly stderr?: NodeJS.WriteStream;
  readonly setExitCode?: (code: number) => void;
}

const writeLine = (stream: NodeJS.WriteStream, message: string): void => {
  stream.write(`${message}\n`);
};

const printDiagnostics = (
  stream: NodeJS.WriteStream,
  warnings: readonly string[],
  errors: readonly { readonly code: string; readonly message: string }[]
): void => {
  warnings.forEach((warning) => writeLine(stream, `warning: ${warning}`));
  errors.forEach((error) => writeLine(stream, `error: ${error.code} ${error.message}`));
};

/**
 * Creates the `transform` CLI command.
 */
export const createTransformCommand = (dependencies: TransformCommandDependencies): Command => {
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  const setExitCode = dependencies.setExitCode ?? ((code: number) => void (process.exitCode = code));

  return new Command("transform")
    .description("Transform ATS JSON + Resume PDF into projected JSON output.")
    .requiredOption("--ats <file>", "Path to ATS JSON file")
    .requiredOption("--resume <file>", "Path to Resume PDF file")
    .requiredOption("--config <file>", "Path to runtime projection config JSON file")
    .option("--output <file>", "Write projected JSON output to file")
    .action(async (rawOptions: TransformCommandRawOptions) => {
      try {
        const parsedOptions = parseTransformOptions(rawOptions);
        if (!parsedOptions.ok) {
          writeLine(stderr, `error: ${parsedOptions.error.code} ${parsedOptions.error.message}`);
          setExitCode(1);
          return;
        }

        const result = await dependencies.runPipeline(parsedOptions.value);
        if (!result.ok) {
          writeLine(
            stderr,
            `error: ${result.error.error.code} ${result.error.error.message}`
          );

          printDiagnostics(
            stderr,
            result.error.context.diagnostics.warnings,
            result.error.context.diagnostics.errors.map((error) => ({
              code: error.code,
              message: error.message
            }))
          );
          setExitCode(1);
          return;
        }

        printDiagnostics(
          stderr,
          result.value.context.diagnostics.warnings,
          result.value.context.diagnostics.errors.map((error) => ({
            code: error.code,
            message: error.message
          }))
        );

        const outputPath = parsedOptions.value.outputPath;
        if (outputPath) {
          await dependencies.writeTextFile(outputPath, `${result.value.outputJson}\n`);
          writeLine(stderr, `written: ${outputPath}`);
        } else {
          writeLine(stdout, result.value.outputJson);
        }

        setExitCode(0);
      } catch (error) {
        writeLine(
          stderr,
          `error: CLI_TRANSFORM_FAILED ${
            error instanceof Error ? error.message : "Unknown CLI transform failure."
          }`
        );
        setExitCode(1);
      }
    });
};
