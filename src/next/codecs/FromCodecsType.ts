import ViewModelCodec from '../api/ViewModelCodec';
import { constructorAsFunc } from './ioTs';

export default class FromCodecsType<
  T,
  OutputT,
  DecodedT extends T,
>
extends ViewModelCodec<T, OutputT, DecodedT> {
  public encodeCodec: ViewModelCodec<T, OutputT, T>;
  public decodeCodec: ViewModelCodec<DecodedT, unknown, DecodedT>;

  public constructor({
    encode,
    decode,
    name,
  }: {
    encode: ViewModelCodec<T, OutputT, T>;
    decode: ViewModelCodec<DecodedT, unknown, DecodedT>;
    name?: string;
  }) {
    super({
      name: name ?? `fromCodecs({encode:${encode.name},decode:${decode.name}})`,
      getChildCodecs: () => [encode, decode],
      is: encode.is,
      validateWithState: decode.validateWithState,
      encodeWithState: encode.encodeWithState,
      encodeDiffWithState: encode.encodeDiffWithState,
    });
    this.encodeCodec = encode;
    this.decodeCodec = decode;
  }
}

export const fromCodecs = constructorAsFunc(FromCodecsType);
