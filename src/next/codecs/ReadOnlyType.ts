import ViewModelCodec, { AnyCodec, DecodedTypeOf } from '../api/ViewModelCodec';
import * as v from './ioTs';

export default class ReadOnlyType<C extends AnyCodec>
extends ViewModelCodec<
  undefined | DecodedTypeOf<C>,
  undefined,
  DecodedTypeOf<C>
> {
  public constructor(codec: C) {
    super({
      name: `readOnly(${codec.name})`,
      getChildCodecs: () => [codec],
      // Make sure the `is` implementation matches the types. This is important
      // when `readOnly()` is used inside `union()`, because `union()` uses `is`
      // to decide which codec to use for encoding.
      is: v.union([v.undefined, codec]).is,
      validateWithState: (codec as ViewModelCodec<unknown, unknown, DecodedTypeOf<C>>).validateWithState,
      encodeWithState: () => undefined,
      encodeDiffWithState: () => undefined,
    });
  }
}

/**
 * `v.readOnly(codec)` behaves like:
 *
 * ```
 * v.fromCodecs({
 *   decode: codec,
 *   encode: v.union([v.undefined, codec]),
 * });
 * ```
 *
 * Except that it always returns `undefined` when encoding.
 */
export const readOnly = v.constructorAsFunc(ReadOnlyType);
