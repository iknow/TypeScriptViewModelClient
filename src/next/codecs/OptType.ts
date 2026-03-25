import ViewModelCodec, {
  AnyCodec,
  TypeOf,
  OutputTypeOf,
  DecodedTypeOf,
} from '../api/ViewModelCodec';
import * as v from './ioTs';
import FromCodecsType from './FromCodecsType';

export default class OptType<C extends AnyCodec>
extends FromCodecsType<
  undefined | TypeOf<C>,
  undefined | OutputTypeOf<C>,
  DecodedTypeOf<C>
> {
  public constructor(codec: C) {
    super({
      name: `opt(${codec.name})`,
      decode: codec as ViewModelCodec<DecodedTypeOf<C>, unknown, DecodedTypeOf<C>>,
      encode: v.union([v.undefined, codec]),
    });
  }
}

/**
 * A value that is required when decoding but optional when encoding.
 *
 * Mainly useful for the `id` field, since the `id` should not be specified when
 * making a request to create a new entity, but it will always be included when
 * decoding entities in a response.
 *
 * It can also be useful for having more control over diffs created with
 * `encodeDiffRequest`: to make sure that a field is always included in the
 * diff, you can make it locally optional with `v.opt()` and set the field's
 * value to `undefined` in the `fromValue` passed to `encodeDiffRequest`.
 *
 * Note: "opt" is short for "optional", since this makes the value optional
 * locally.
 */
export const opt = v.constructorAsFunc(OptType);
