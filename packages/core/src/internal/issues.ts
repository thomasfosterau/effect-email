/**
 * The issue formatting every channel's boundary decoder shares. Internal:
 * not re-exported from the package index, and excluded from docgen.
 */

import type * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as Str from "effect/String";

/** Effect's default (tree) issue formatter, one line per leaf issue. */
const formatIssue: (issue: SchemaIssue.Issue) => string = SchemaIssue.makeFormatterDefault();

/** A schema failure as one trimmed, non-empty line per issue. */
export const issueLines = (error: Schema.SchemaError): ReadonlyArray<string> =>
  formatIssue(error.issue)
    .split("\n")
    .map((line: string) => line.trimEnd())
    .filter(Str.isNonEmpty);
