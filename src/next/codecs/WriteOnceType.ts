import ViewModelCodec, { AnyCodec, TypeOf, DecodedTypeOf, OutputTypeOf } from '../api/ViewModelCodec';
import { newEntityContextKey } from './EntityType';
import * as v from './ioTs';

export default class WriteOnceType<C extends AnyCodec>
extends ViewModelCodec<
  undefined | TypeOf<C>,
  undefined | OutputTypeOf<C>,
  DecodedTypeOf<C>
> {
  public constructor(codec: C) {
    super({
      name: `writeOnce(${codec.name})`,
      getChildCodecs: () => [codec],
      // Make sure the `is` implementation matches the types. This is important
      // when `writeOnce()` is used inside `union()`, because `union()` uses `is`
      // to decide which codec to use for encoding.
      is: v.union([v.undefined, codec]).is,
      validateWithState: (codec as ViewModelCodec<unknown, unknown, DecodedTypeOf<C>>).validateWithState,
      encodeWithState: (value, state) => {
        if (value === undefined) return undefined;

        const isNew = state.get(newEntityContextKey);
        if (!isNew) return undefined;

        return codec.encodeWithState(value, state) as OutputTypeOf<C>;
      },
      encodeDiffWithState: (oldValue, newValue, state) => {
        const isNew = state.get(newEntityContextKey);
        if (!isNew) return undefined;
        return codec.encodeDiffWithState(oldValue, newValue, state) as undefined | OutputTypeOf<C>;
      },
    });
  }
}

/**
 * `v.writeOnce(codec)` behaves like:
 *
 * ```
 * v.fromCodecs({
 *   decode: codec,
 *   encode: v.union([v.undefined, codec]),
 * });
 * ```
 *
 * Except that it always returns `undefined` when encoding if it is not encoding a value with
 * `_new: true` in the entity it belongs to.
 */
export const writeOnce = v.constructorAsFunc(WriteOnceType);
