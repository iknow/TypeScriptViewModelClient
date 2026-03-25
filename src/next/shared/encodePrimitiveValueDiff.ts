import * as Immutable from 'immutable';
import isEqual from 'lodash/isEqual';
import {
  AnyCodec,
  TypeOf,
  OutputTypeOf,
} from '../api/ViewModelCodec';
import StateContainer from '../api/StateContainer';

/**
 * A generic implementation of `encodeDiffWithState` which can be used for
 * codecs that only handle primitive values and don't need to do any diffing.
 *
 * Used by `fromIoTs` to implement `encodeDiffWithState` for `io-ts` codecs.
 */
export default function encodePrimitiveValueDiff<C extends AnyCodec>(
  codec: C,
  oldValue: TypeOf<C>,
  newValue: TypeOf<C>,
  state: StateContainer,
): OutputTypeOf<C> | undefined {
  if (Immutable.is(oldValue, newValue)) {
    // Because `Immutable.is` should be faster than `lodash/isEqual`, as an
    // optimization try `Immutable.is` first to avoid calling
    // `encodeWithState` and `lodash/isEqual` when not necessary.
    return undefined;
  }

  const oldEncoded = codec.encodeWithState(oldValue, state);
  const newEncoded = codec.encodeWithState(newValue, state);

  if (!isEqual(oldEncoded, newEncoded)) {
    return newEncoded as OutputTypeOf<C>;
  }

  return undefined;
}
