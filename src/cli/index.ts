/**
 * CLI entrypoint factory.
 */

import { Command, CommanderError } from "commander";
import { createTransformCommand, type TransformCommandDependencies } from "./commands/transform.command.js";

/**
 * Shared dependencies required by CLI commands.
 */
export interface CliDependencies extends TransformCommandDependencies {}

/**
 * Creates configured CLI program.
 */
export const createCli = (dependencies: CliDependencies): Command => {
  const program = new Command();
  program.name("candidate-transformer");
  program.description("Deterministic multi-source candidate data transformer.");
  program.addCommand(createTransformCommand(dependencies));
  return program;
};

/**
 * Runs CLI with provided argv and returns deterministic exit code.
 */
export const runCli = async (
  argv: readonly string[],
  dependencies: CliDependencies
): Promise<number> => {
  const stderr = dependencies.stderr ?? process.stderr;
  let exitCode = 0;
  const effectiveDependencies: CliDependencies = {
    ...dependencies,
    setExitCode: (code: number) => {
      exitCode = code;
      if (dependencies.setExitCode) {
        dependencies.setExitCode(code);
        return;
      }
      process.exitCode = code;
    }
  };

  const program = createCli(effectiveDependencies);
  program.exitOverride();

  try {
    if (argv.length === 0) {
      program.outputHelp({ error: true });
      return 1;
    }
    await program.parseAsync(argv as string[], { from: "user" });
    return exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code !== "commander.executeSubCommandAsync") {
        stderr.write(`${error.message}\n`);
      }
      return error.exitCode;
    }

    stderr.write(
      `${
        error instanceof Error
          ? error.message
          : "Unexpected CLI failure."
      }\n`
    );
    return 1;
  }
};
