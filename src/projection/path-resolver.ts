/**
 * Deterministic path parsing and value resolution helpers for projection.
 */

/**
 * Path token for property access.
 */
export interface PropertyPathToken {
  readonly kind: "property";
  readonly key: string;
}

/**
 * Path token for indexed array access.
 */
export interface IndexPathToken {
  readonly kind: "index";
  readonly index: number;
}

/**
 * Path token for wildcard array expansion (`[]`).
 */
export interface WildcardPathToken {
  readonly kind: "wildcard";
}

/**
 * Discriminated path token union.
 */
export type PathToken = PropertyPathToken | IndexPathToken | WildcardPathToken;

/**
 * Parsed path structure.
 */
export interface ParsedPath {
  readonly path: string;
  readonly tokens: readonly PathToken[];
  readonly hasWildcard: boolean;
}

/**
 * Deterministic path error payload.
 */
export interface PathResolutionError {
  readonly code:
    | "PATH_EMPTY"
    | "PATH_INVALID_CHARACTER"
    | "PATH_INVALID_IDENTIFIER"
    | "PATH_UNTERMINATED_BRACKET"
    | "PATH_INVALID_INDEX"
    | "PATH_TYPE_MISMATCH"
    | "PATH_WILDCARD_NOT_ALLOWED";
  readonly message: string;
  readonly path: string;
  readonly position: number;
}

/**
 * Generic resolver result.
 */
export type PathResolverResult<TValue> =
  | {
      readonly ok: true;
      readonly value: TValue;
    }
  | {
      readonly ok: false;
      readonly error: PathResolutionError;
    };

/**
 * Path value resolution result payload.
 */
export interface ResolvedPathValue {
  readonly found: boolean;
  readonly value: unknown;
}

const IDENTIFIER_START = /[A-Za-z_]/;
const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;

const createError = (
  code: PathResolutionError["code"],
  message: string,
  path: string,
  position: number
): PathResolutionError => ({
  code,
  message,
  path,
  position
});

/**
 * Parses dot/bracket path syntax into deterministic token sequence.
 */
export const parsePath = (rawPath: string): PathResolverResult<ParsedPath> => {
  const path = rawPath.trim();
  if (path.length === 0) {
    return {
      ok: false,
      error: createError("PATH_EMPTY", "Path cannot be empty.", rawPath, 0)
    };
  }

  const tokens: PathToken[] = [];
  let index = 0;
  let hasWildcard = false;

  while (index < path.length) {
    const startChar = path.charAt(index);
    if (!IDENTIFIER_START.test(startChar)) {
      return {
        ok: false,
        error: createError(
          "PATH_INVALID_IDENTIFIER",
          `Invalid identifier start at position ${index}.`,
          path,
          index
        )
      };
    }

    let end = index + 1;
    while (end < path.length && IDENTIFIER_CHAR.test(path.charAt(end))) {
      end += 1;
    }

    tokens.push({
      kind: "property",
      key: path.slice(index, end)
    });
    index = end;

    while (path.charAt(index) === "[") {
      const closing = path.indexOf("]", index);
      if (closing === -1) {
        return {
          ok: false,
          error: createError(
            "PATH_UNTERMINATED_BRACKET",
            `Unterminated bracket at position ${index}.`,
            path,
            index
          )
        };
      }

      const inside = path.slice(index + 1, closing);
      if (inside.length === 0) {
        tokens.push({ kind: "wildcard" });
        hasWildcard = true;
      } else if (/^\d+$/.test(inside)) {
        tokens.push({
          kind: "index",
          index: Number(inside)
        });
      } else {
        return {
          ok: false,
          error: createError(
            "PATH_INVALID_INDEX",
            `Invalid array index "${inside}" at position ${index}.`,
            path,
            index
          )
        };
      }

      index = closing + 1;
    }

    if (index === path.length) {
      break;
    }

    if (path.charAt(index) !== ".") {
      const unexpected = path.charAt(index);
      return {
        ok: false,
        error: createError(
          "PATH_INVALID_CHARACTER",
          `Unexpected character "${unexpected}" at position ${index}.`,
          path,
          index
        )
      };
    }

    index += 1;
    if (index === path.length) {
      return {
        ok: false,
        error: createError(
          "PATH_INVALID_CHARACTER",
          "Path cannot end with a dot.",
          path,
          index - 1
        )
      };
    }
  }

  return {
    ok: true,
    value: {
      path,
      tokens,
      hasWildcard
    }
  };
};

/**
 * Resolves value from object graph by parsed path.
 * Returns `{found:false}` for missing values and deterministic errors for invalid traversal.
 */
export const resolvePathValue = (
  source: unknown,
  path: string
): PathResolverResult<ResolvedPathValue> => {
  const parsed = parsePath(path);
  if (!parsed.ok) {
    return parsed;
  }

  let currentValues: unknown[] = [source];

  for (const [tokenIndex, token] of parsed.value.tokens.entries()) {
    const nextValues: unknown[] = [];

    for (const current of currentValues) {
      if (token.kind === "property") {
        if (
          current !== null &&
          typeof current === "object" &&
          !Array.isArray(current) &&
          token.key in (current as Record<string, unknown>)
        ) {
          nextValues.push((current as Record<string, unknown>)[token.key]);
        }
        continue;
      }

      if (token.kind === "index") {
        if (current === null || current === undefined) {
          continue;
        }
        if (!Array.isArray(current)) {
          return {
            ok: false,
            error: createError(
              "PATH_TYPE_MISMATCH",
              `Expected array at token index ${tokenIndex}.`,
              path,
              tokenIndex
            )
          };
        }
        if (token.index < current.length) {
          nextValues.push(current[token.index]);
        }
        continue;
      }

      if (current === null || current === undefined) {
        continue;
      }
      if (!Array.isArray(current)) {
        return {
          ok: false,
          error: createError(
            "PATH_TYPE_MISMATCH",
            `Expected array for wildcard at token index ${tokenIndex}.`,
            path,
            tokenIndex
          )
        };
      }
      nextValues.push(...current);
    }

    if (nextValues.length === 0) {
      return {
        ok: true,
        value: {
          found: false,
          value: undefined
        }
      };
    }

    currentValues = nextValues;
  }

  if (parsed.value.hasWildcard) {
    return {
      ok: true,
      value: {
        found: currentValues.length > 0,
        value: currentValues
      }
    };
  }

  return {
    ok: true,
    value: {
      found: currentValues.length > 0,
      value: currentValues[0]
    }
  };
};

const setAtTokens = (
  current: unknown,
  tokens: readonly PathToken[],
  tokenIndex: number,
  value: unknown
): PathResolverResult<unknown> => {
  if (tokenIndex >= tokens.length) {
    return {
      ok: true,
      value
    };
  }

  const token = tokens.at(tokenIndex);
  if (!token) {
    return {
      ok: false,
      error: createError(
        "PATH_INVALID_CHARACTER",
        `Invalid token index ${tokenIndex}.`,
        "",
        tokenIndex
      )
    };
  }

  if (token.kind === "wildcard") {
    return {
      ok: false,
      error: createError(
        "PATH_WILDCARD_NOT_ALLOWED",
        "Wildcard is not allowed in output path assignment.",
        "",
        tokenIndex
      )
    };
  }

  if (token.kind === "property") {
    const base =
      current !== null && typeof current === "object" && !Array.isArray(current)
        ? (current as Record<string, unknown>)
        : {};
    const existingChild = base[token.key];
    const nextContainer =
      existingChild ??
      (tokens[tokenIndex + 1]?.kind === "index"
        ? []
        : {});
    const updatedChild = setAtTokens(nextContainer, tokens, tokenIndex + 1, value);
    if (!updatedChild.ok) {
      return updatedChild;
    }
    return {
      ok: true,
      value: {
        ...base,
        [token.key]: updatedChild.value
      }
    };
  }

  if (current !== null && current !== undefined && !Array.isArray(current)) {
    return {
      ok: false,
      error: createError(
        "PATH_TYPE_MISMATCH",
        `Expected array while assigning index ${token.index}.`,
        "",
        tokenIndex
      )
    };
  }

  const baseArray = Array.isArray(current) ? [...current] : [];
  const existingChild = baseArray[token.index];
  const nextContainer =
    existingChild ??
    (tokens[tokenIndex + 1]?.kind === "index"
      ? []
      : {});
  const updatedChild = setAtTokens(nextContainer, tokens, tokenIndex + 1, value);
  if (!updatedChild.ok) {
    return updatedChild;
  }
  baseArray[token.index] = updatedChild.value;
  return {
    ok: true,
    value: baseArray
  };
};

/**
 * Assigns value to output path without mutating input object.
 * Wildcards are rejected for assignment paths.
 */
export const assignPathValue = (
  output: Readonly<Record<string, unknown>>,
  path: string,
  value: unknown
): PathResolverResult<Readonly<Record<string, unknown>>> => {
  const parsed = parsePath(path);
  if (!parsed.ok) {
    return parsed;
  }

  if (parsed.value.hasWildcard) {
    return {
      ok: false,
      error: createError(
        "PATH_WILDCARD_NOT_ALLOWED",
        "Wildcard is not allowed in output path.",
        path,
        0
      )
    };
  }

  const assigned = setAtTokens(output, parsed.value.tokens, 0, value);
  if (!assigned.ok) {
    return {
      ok: false,
      error: {
        ...assigned.error,
        path
      }
    };
  }

  return {
    ok: true,
    value: assigned.value as Readonly<Record<string, unknown>>
  };
};
