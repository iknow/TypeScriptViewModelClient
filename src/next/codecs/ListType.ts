import * as Immutable from 'immutable';
import { right, isLeft } from 'fp-ts/lib/Either';
import ViewModelCodec, {
  TypeOf,
  DecodedTypeOf,
  OutputTypeOf,
  AnyCodec,
} from '../api/ViewModelCodec';
import collectionHasDiffs from '../shared/collectionHasDiffs';
import * as v from './ioTs';

export default abstract class ListType<
  C extends AnyCodec,
  T extends Immutable.List<TypeOf<C>>,
  OutputT,
  DecodedT extends T,
> extends ViewModelCodec<T, OutputT, DecodedT> {
  public abstract type: C;
}

export class NonDiffableListType<C extends AnyCodec>
extends ListType<
  C,
  Immutable.List<TypeOf<C>>,
  Array<OutputTypeOf<C>>,
  Immutable.List<DecodedTypeOf<C>>
> {
  public readonly type: C;

  public constructor(type: C) {
    const arrayType = v.array(type);

    super({
      name: `list(${type.name})`,
      getChildCodecs: () => [type],
      is: (value: unknown): value is Immutable.List<TypeOf<C>> => (
        Immutable.List.isList(value) && arrayType.is(value.toArray())
      ),
      validateWithState: (input, context, state) => {
        const arrayEither = arrayType.validateWithState(input, context, state);

        if (isLeft(arrayEither)) {
          return arrayEither;
        }

        return right(Immutable.List(arrayEither.right));
      },
      encodeWithState: (value, state) => (
        arrayType.encodeWithState(value.toArray(), state)
      ),
      encodeDiffWithState: (oldValue, newValue, state) => (
        (oldValue.size !== newValue.size || collectionHasDiffs(type, oldValue, newValue, state)) ?
          this.encodeWithState(newValue, state) :
          undefined
      ),
    });

    this.type = type;
  }
}

export const list = v.constructorAsFunc(NonDiffableListType);
