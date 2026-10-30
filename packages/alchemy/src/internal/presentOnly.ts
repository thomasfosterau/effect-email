/**
 * The rule every builder with optional values follows: an unset or blank
 * optional value is left out of the bindings record.
 *
 * @module internal/presentOnly
 * @internal
 * @since 0.1.0
 */

import * as Option from "effect/Option";
import * as R from "effect/Record";
import * as Str from "effect/String";

/**
 * The present entries of a record of optional values, as a record holding
 * only those keys. An absent or blank value is omitted, never bound as
 * `undefined` (Alchemy would deploy that as a JSON binding) or as `""`: a
 * blank binding is the same case as an absent one to every provider's
 * resolver.
 *
 * @internal
 * @since 0.1.0
 */
export const presentOnly = <K extends string>(entries: {
  readonly [P in K]: Option.Option<string>;
}): { readonly [P in K]?: string } => {
  const none: { readonly [P in K]?: string } = {};
  return R.reduce(entries, none, (present, option, key) =>
    Option.match(
      Option.filter(option, (value) => Str.isNonEmpty(value.trim())),
      {
        onNone: () => present,
        onSome: (value) => ({ ...present, [key]: value }),
      },
    ),
  );
};
