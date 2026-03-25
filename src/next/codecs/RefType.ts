import * as Immutable from 'immutable';
import { isLeft } from 'fp-ts/lib/Either';
import ViewModelCodec, {
  Validation,
  ValidationContext,
  TypeOf,
} from '../api/ViewModelCodec';
import ViewModelFields from '../shared/ViewModelFields';
import StateContainer from '../api/StateContainer';
import { IEntityMetaType } from '../shared/Entity';
import TypeIdRecord from '../shared/TypeIdRecord';
import EntityType from './EntityType';
import * as v from './ioTs';

const refCountKey = StateContainer.createKey(0);

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface IReferences {
  [key: string]: IEntityLike;
}
export const referencesKey = StateContainer.createKey<IReferences>({});

const cachedRefHashesKey = StateContainer.createKey<
  Immutable.Map<TypeIdRecord, string>
>(Immutable.Map());

export interface IRefObject {
  [ViewModelFields.Ref]: string;
}
const unknownRefCodec: ViewModelCodec<IRefObject> = v.type({
  [ViewModelFields.Ref]: v.string,
});

interface IEntityLike {
  [ViewModelFields.Type]: string;
  [ViewModelFields.Id]?: unknown;
  [key: string]: unknown;
}

export interface IRefable<F extends v.IFields, TypeName extends string> extends IEntityMetaType<TypeName> {
  id: TypeOf<F['id']>;
}

export class EncodedRefType<
  F extends v.IFields,
  T extends IRefable<F, TypeName> & v.TypesForFields<F>,
  DecodedT extends T,
  TypeName extends string,
>
extends ViewModelCodec<
  T,
  IRefObject,
  DecodedT
> {
  public readonly codec: EntityType<F, T, DecodedT, TypeName>;

  public constructor(codec: EntityType<F, T, DecodedT, TypeName>) {
    const refType = new RefType<F, T, DecodedT, TypeName>(codec);

    super({
      name: `ref(${codec.name})`,
      is: codec.is as ((value: unknown) => value is T),
      getChildCodecs: () => [codec],

      validateWithState: refType.validateWithState,

      encodeWithState: (value, state) => {
        const existingRef = getRefFor(value.id, this.codec.typeName, state);
        if (existingRef !== undefined) {
          return existingRef;
        }

        const data = codec.encodeWithState(value, state);
        return addRefAndGetRefObject(data, state);
      },

      encodeDiffWithState: (oldValue, newValue, state) => {
        const existingRef = getRefFor(newValue.id, this.codec.typeName, state);
        if (existingRef !== undefined) {
          return existingRef;
        }

        const diff = codec.encodeDiffWithState(oldValue, newValue, state);
        if (diff === undefined) {
          return undefined;
        }
        return addRefAndGetRefObject(diff, state);
      },
    });

    this.codec = codec;
  }
}

export default class RefType<
  F extends v.IFields,
  T extends IRefable<F, TypeName> & v.TypesForFields<F>,
  DecodedT extends T,
  TypeName extends string,
>
extends ViewModelCodec<
  IRefable<F, TypeName>,
  IRefObject,
  DecodedT
> {
  public readonly codec: EntityType<F, T, DecodedT, TypeName>;

  public constructor(codec: EntityType<F, T, DecodedT, TypeName>) {
    const validatedRefsKey = StateContainer.createKey<
      Immutable.Map<string, Validation<unknown>>
    >(Immutable.Map());

    const { typeName } = codec;
    const refableCodec = v.type({
      id: codec.fields.id,
      [ViewModelFields.Type]: v.literal(typeName),
    });

    super({
      name: `ref(${codec.name})`,
      is: refableCodec.is,
      getChildCodecs: () => [codec],

      validateWithState: (input, context, state) => {
        const refEither = unknownRefCodec.validateWithState(input, context, state);

        if (isLeft(refEither)) {
          return refEither;
        }

        const refHash = refEither.right[ViewModelFields.Ref];

        // Use validate function and ref hash as key to look up cached validation,
        // so that different codecs decoding the same ref hash won't share the same cache.
        const cachedReference = (
          state
          .get(validatedRefsKey)
          .get(refHash) as (Validation<DecodedT> | undefined)
        );
        if (cachedReference !== undefined) {
          return cachedReference;
        }

        const referenceData = state.get(referencesKey)[refHash];

        // Create new validation context because the same reference may be used in
        // multiple places, so the context may be misleading.
        const refValidationContext: ValidationContext = [{ key: `ref(${refHash})`, type: this }];
        const refDataEither = codec.validateWithState(referenceData, refValidationContext, state);

        // Cache result regardless of success/failure.
        state.update(validatedRefsKey, (map) => map.set(
          refHash,
          refDataEither,
        ));

        return refDataEither;
      },

      encodeWithState: (value, state) => {
        const { id } = value;

        const existingRef = getRefFor(id, typeName, state);
        if (existingRef !== undefined) {
          return existingRef;
        }

        return addRefAndGetRefObject({
          [ViewModelFields.Id]: id,
          [ViewModelFields.Type]: typeName,
        }, state);
      },

      encodeDiffWithState: (oldValue, newValue, state) => {
        if (oldValue.id === newValue.id) {
          return undefined;
        }

        return this.encodeWithState(newValue, state);
      },
    });

    this.codec = codec;
  }
}

const addRefAndGetRefObject = (data: IEntityLike, state: StateContainer) => {
  const refCount = state.get(refCountKey);
  state.set(refCountKey, refCount + 1);
  const refHash = `ref${refCount}`;

  const id = data[ViewModelFields.Id];
  if (id !== undefined) {
    state.update(cachedRefHashesKey, (map) => map.set(
      new TypeIdRecord({
        id,
        type: data[ViewModelFields.Type],
      }),
      refHash,
    ));
  }

  state.update(referencesKey, (references) => ({
    ...references,
    [refHash]: data,
  }));

  return { [ViewModelFields.Ref]: refHash };
};

/**
 * If a root entity with this type/id has already been encoded, use the
 * existing ref object and skip re-encoding the entity. This is to handle the
 * possibility of encoding an entity containing multiple `Handle`s referencing
 * the same root entity.
 */
const getRefFor = (
  id: unknown,
  typeName: string,
  state: StateContainer,
): IRefObject | undefined => {
  if (id !== undefined) {
    const cachedHash = state.get(cachedRefHashesKey).get(new TypeIdRecord({
      id,
      type: typeName,
    }));
    if (cachedHash) {
      return { [ViewModelFields.Ref]: cachedHash };
    }
  }

  return undefined;
};

/**
 * Decodes/encodes the given entity as a shared reference (i.e. its data is not
 * nested but is stored in the `references` key of the request/response).
 *
 * Note that the backend viewmodel API allows updating root entities via
 * endpoints for a different type of root entity. For example, you can update a
 * `User` entity while creating a new `Comment` entity via a `/api/comments`
 * endpoint. If this is not desired, `ref()` should be used instead of
 * `encodedRef()`.
 */
export const encodedRef = v.constructorAsFunc(EncodedRefType);

/**
 * When decoding, decodes the entire entity, but when encoding, only encodes a
 * reference to the entity with the given id/type but with no data.
 */
export const ref = v.constructorAsFunc(RefType);
