import ViewModelCodec from '../api/ViewModelCodec';
import * as v from './ioTs';

const mapEmptyAsNull = <S extends string>(value: S | null) =>
  value === null || value === '' ? null : value;

export default class EmptyAsNullType<
  InnerT,
  InnerOutputS extends string,
  DecodedT extends InnerT,
>
extends ViewModelCodec<
  null | InnerT,
  null | InnerOutputS,
  null | DecodedT
> {
  public constructor(
    codec: ViewModelCodec<InnerT, InnerOutputS, DecodedT>,
  ) {
    const internalCodec = v.nullable(codec);
    super({
      name: `emptyAsNull(${codec.name})`,
      getChildCodecs: () => [codec],
      is: internalCodec.is,
      validateWithState: internalCodec.validateWithState,
      encodeWithState: (value, state) => (
        mapEmptyAsNull(internalCodec.encodeWithState(value, state))
      ),
      encodeDiffWithState: (oldValue, newValue, state) => {
        const innerValue = internalCodec.encodeDiffWithState(oldValue, newValue, state);
        if (innerValue === undefined) return undefined;
        const mapped = mapEmptyAsNull(innerValue);
        if (oldValue === mapped) return undefined;
        return mapped;
      },
    });
  }
}

/**
 * A codec that transforms a string to `null` if it is empty on encode. Decoding is not affected.
 */
export const emptyAsNull = v.constructorAsFunc(EmptyAsNullType);
