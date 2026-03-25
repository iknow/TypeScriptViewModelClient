import * as EitherFP from 'fp-ts/lib/Either';
import ViewModelCodec from '../api/ViewModelCodec';
import { constructorAsFunc } from './ioTs';

export default class MappedType<
  T,
  OutputT,
  DecodedT extends T,
  InnerT,
  InnerDecodedT extends InnerT,
>
extends ViewModelCodec<T, OutputT, DecodedT> {
  public innerCodec: ViewModelCodec<InnerT, OutputT, InnerDecodedT>;

  public constructor({
    codec,
    afterDecode,
    beforeEncode,
  }: {
    codec: ViewModelCodec<InnerT, OutputT, InnerDecodedT>;
    afterDecode: (value: InnerDecodedT) => DecodedT;
    beforeEncode: (value: T) => InnerT;
  }) {
    super({
      name: `mapped({codec:${codec.name}})`,
      getChildCodecs: () => [codec],
      is: (value: unknown): value is T => {
        try {
          // Dirty hack?: If `mapEncode(value)` throws, then we know this is not
          // an `T` and can return false (or `map()` has a bug). If it succeeds,
          // make sure the result matches the codec.
          return codec.is(beforeEncode(value as T));
        } catch (e) {
          return false;
        }
      },
      validateWithState: (input, context, state) => {
        const innerEither = codec.validateWithState(input, context, state);
        if (EitherFP.isLeft(innerEither)) {
          return innerEither;
        }

        return EitherFP.right(afterDecode(innerEither.right));
      },
      encodeWithState: (value, state) => (
        codec.encodeWithState(beforeEncode(value), state)
      ),
      encodeDiffWithState: (oldValue, newValue, state) => (
        codec.encodeDiffWithState(beforeEncode(oldValue), beforeEncode(newValue), state)
      ),
    });
    this.innerCodec = codec;
  }
}

export const mapped = constructorAsFunc(MappedType);
