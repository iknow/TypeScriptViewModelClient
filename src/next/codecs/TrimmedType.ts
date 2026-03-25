import ViewModelCodec from '../api/ViewModelCodec';
import { constructorAsFunc } from './ioTs';

export default class TrimmedType<
  InnerT,
  InnerOutputS extends string,
  DecodedT extends InnerT,
>
extends ViewModelCodec<InnerT, string, DecodedT> {
  public constructor(codec: ViewModelCodec<InnerT, InnerOutputS, DecodedT>) {
    super({
      name: `trimmed(${codec.name})`,
      getChildCodecs: () => [codec],
      is: codec.is,
      validateWithState: codec.validateWithState,
      encodeWithState: (value, state) => (
        codec.encodeWithState(value, state).trim()
      ),
      encodeDiffWithState: (oldValue, newValue, state) => {
        const innerValue = codec.encodeDiffWithState(oldValue, newValue, state);
        if (innerValue === undefined) return undefined;
        const trimmed = innerValue.trim();
        if (oldValue === trimmed) return undefined;
        return trimmed;
      },
    });
  }
}

/**
 * A codec that wraps a string codec, and trims the string for leading and trailing whitespace before encoding. Decoding
 * is not affected.
 */
export const trimmed = constructorAsFunc(TrimmedType);
