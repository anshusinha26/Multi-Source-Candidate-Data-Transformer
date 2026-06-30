import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const helpersDir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(helpersDir, "..", "fixtures");

export const fixturePath = (relativePath: string): string =>
  resolve(fixturesDir, relativePath);

export const loadFixtureText = async (relativePath: string): Promise<string> =>
  readFile(fixturePath(relativePath), "utf8");

export const loadFixtureBytes = async (relativePath: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(fixturePath(relativePath)));

export const loadFixtureJson = async <TValue = unknown>(
  relativePath: string
): Promise<TValue> => JSON.parse(await loadFixtureText(relativePath)) as TValue;
