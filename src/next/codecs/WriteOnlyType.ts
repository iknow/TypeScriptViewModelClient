import { TypeOf, OutputTypeOf, AnyCodec } from '../api/ViewModelCodec';
import * as v from './ioTs';
import FromCodecsType from './FromCodecsType';

export default class WriteOnlyType<C extends AnyCodec>
extends FromCodecsType<
  undefined | TypeOf<C>,
  undefined | OutputTypeOf<C>,
  undefined
> {
  public constructor(codec: C) {
    super({
      name: `writeOnly(${codec.name})`,
      decode: v.undefined,
      encode: v.union([v.undefined, codec]),
    });
  }
}

/**
 * `v.writeOnly(codec)` is equivalent to:
 *
 * ```
 * v.fromCodecs({
 *   decode: v.undefined,
 *   encode: v.union([v.undefined, codec]),
 * });
 * ```
 *
 * This means that `writeOnly` fields always allow `undefined` when encoding.
 */
export const writeOnly = v.constructorAsFunc(WriteOnlyType);
