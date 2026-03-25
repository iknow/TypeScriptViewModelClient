import { isLeft, right } from 'fp-ts/lib/Either';
import ViewModelCodec, { OutputTypeOf, Validation } from '../api/ViewModelCodec';
import ViewModelFields from '../shared/ViewModelFields';
import {
  IAnyEntityConstructorWithId,
  Entity,
  DecodedEntity,
} from '../shared/Entity';
import Handle, {
  IdForConstructor,
  DecodedIdForConstructor,
  DecodedHandle,
  DangerousHandle,
} from '../api/Handle';
import EntityDB, { BaseEntityDB, DecodedEntityDB } from '../api/EntityDB';
import StateContainer from '../api/StateContainer';
import { constructorAsFunc, IFields } from './ioTs';
import { ref, encodedRef, IRefObject, IRefable } from './RefType';
import NestedType, { nested } from './NestedType';
import { oldEntitiesDbKey } from './EntityType';
import TypeIdRecord from '../shared/TypeIdRecord';

export const decodingEntityDbKey = StateContainer.createKey(DecodedEntityDB.emptyDb);
export const encodingEntityDbKey = StateContainer.createKey<BaseEntityDB>(EntityDB.emptyDb);
export const fromEntityDbKey = StateContainer.createKey<BaseEntityDB>(EntityDB.emptyDb);

export default class HandleType<
  C extends IAnyEntityConstructorWithId,
>
extends ViewModelCodec<
  Handle<C, IdForConstructor<C>>,
  OutputTypeOf<NestedType<C>> | IRefObject,
  DecodedHandle<C, DecodedIdForConstructor<C>>
> {
  public readonly entityConstructor: C;
  public readonly type: NestedType<C>;

  public constructor(entityConstructor: C) {
    const codec = new NestedType(entityConstructor);

    super({
      name: `handle(${codec.typeName})`,
      getChildCodecs: () => [codec],
      is: (value: unknown): value is Handle<C, IdForConstructor<C>> => (
        value instanceof Handle && value.type === entityConstructor
      ),
      validateWithState: (input, context, state) => {
        const entityEither = codec.validateWithState(input, context, state);
        return validateHandle(entityEither, entityConstructor, state);
      },
      encodeWithState: (handle, state) => {
        const entity = state.get(encodingEntityDbKey).get(handle);

        updateOldEntities(entityConstructor, handle, state);

        if (!entity) throw new Error(`Could not find entity for handle ${handle.toString()}`);
        return codec.encodeWithState(entity, state);
      },
      encodeDiffWithState: (oldHandle, newHandle, state) => {
        const newEntity = state.get(encodingEntityDbKey).get(newHandle);
        const oldEntity = state.get(fromEntityDbKey).get(oldHandle);
        if (!oldEntity) throw new Error(`Could not find entity for handle ${oldHandle.toString()}`);
        if (!newEntity) throw new Error(`Could not find entity for handle ${newHandle.toString()}`);
        return codec.encodeDiffWithState(oldEntity, newEntity, state);
      },
    });

    this.entityConstructor = entityConstructor;
    this.type = codec;
  }
}

export class RefHandleType<
  C extends IAnyEntityConstructorWithId,
>
extends ViewModelCodec<
  DecodedHandle<C, DecodedIdForConstructor<C>>,
  OutputTypeOf<NestedType<C>> | IRefObject,
  DecodedHandle<C, DecodedIdForConstructor<C>>
> {
  public readonly entityConstructor: C;
  public readonly type: NestedType<C>;

  public constructor(entityConstructor: C) {
    const codec = new NestedType(entityConstructor);
    // The behavior of `refHandle()` is equivalent to using `assertedRefHandle()`
    // without asserting equivalence to any other entity types.
    const assertedRefHandleCodec = assertedRefHandle<C, []>(entityConstructor, []);

    super({
      name: `refHandle(${codec.typeName})`,
      getChildCodecs: () => [assertedRefHandleCodec],
      is: assertedRefHandleCodec.is,
      validateWithState: assertedRefHandleCodec.validateWithState,
      encodeWithState: assertedRefHandleCodec.encodeWithState,
      encodeDiffWithState: assertedRefHandleCodec.encodeDiffWithState,
    });

    this.entityConstructor = entityConstructor;
    this.type = codec;
  }
}

type AnyAllowedHandle<
  RefHandleCtor extends IAnyEntityConstructorWithId,
  AllowedCtors extends IAnyEntityConstructorWithId[],
> = DecodedHandle<RefHandleCtor> | DistributedHandle<AllowedCtors[number]>;
// Uses Distributive Conditional Types to wrap each constructor with `DecodedHandle` separately.
// See https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types
type DistributedHandle<T> = T extends IAnyEntityConstructorWithId ? DecodedHandle<T> : never;

/**
 * Similar to {@link refHandle}, but allows asserting that another type of
 * {@link DecodedHandle} can also be used to encode references to the given entity.
 *
 * This is intended for cases where a single backend model has multiple
 * independent viewmodels (e.g. the full `User` viewmodel and the minimal
 * `UserProfile` viewmodel). For example:
 *
 * `assertedRefHandle(UserProfile, [User])`
 *
 * would mean that the field will be encoded as a `UserProfile` (because that's
 * what the backend expects), but we can also set the field to a
 * `DecodedHandle<typeof User>` if we happen to have the full `User` entity, and it
 * will still properly be encoded as a `UserProfile`.
 *
 * Note that it is okay for the first and second argument to overlap. For example:
 *
 * `assertedRefHandle(UserProfile, [User])`
 *
 * and
 *
 * `assertedRefHandle(UserProfile, [User, UserProfile])`
 *
 * are equivalent.
 *
 * Note that unlike {@link refHandle} which returns a {@link DecodedHandle} when
 * decoding but accepts a {@link Handle} when encoding, {@link assertedRefHandle}
 * only works with {@link DecodedHandle} when both encoding and decoding. This is intentional
 * because the only time a {@link Handle} should be necessary is when creating a
 * new entity, in which case {@link encodedRefHandle} must be used anyway.
 * Technically {@link refHandle} itself could also be made to require a {@link DecodedHandle},
 * but this would cause type errors in code that needs to work with legacy
 * `view-model` v1 entities, so for now only {@link assertedRefHandle} is more strict.
 */
export function assertedRefHandle<
  RefHandleCtor extends IAnyEntityConstructorWithId,
  AllowedCtors extends IAnyEntityConstructorWithId[],
>(
  /**
   * The type of entity that the handle will be encoded/decoded as.
   * Same as the argument to {@link refHandle}.
   */
  refHandleCtor: RefHandleCtor,
  /**
   * The types of other entities that can also be used to encode references
   * to this entity (i.e. because they share the same backing model).
   */
  allowedCtors: AllowedCtors,
): ViewModelCodec<
  AnyAllowedHandle<RefHandleCtor, AllowedCtors>,
  OutputTypeOf<NestedType<RefHandleCtor>> | IRefObject,
  DecodedHandle<RefHandleCtor>
> {
  // This codec is only used internally, so we can use loose types.
  const refCodec = ref<
    IFields,
    IRefable<IFields, string> & Entity<RefHandleCtor>,
    IRefable<IFields, string> & DecodedEntity<RefHandleCtor>,
    string
  // The types are incompatible because we are requiring that the entity
  // constructor has an `id` field using the `fields` property, but this has
  // no direct effect on the fields of the `Entity<C>` type.
  // @ts-expect-error the id types are incompatible
  >(nested(refHandleCtor));

  return new ViewModelCodec({
    name: `assertedRefHandle(${refHandleCtor.typeName}, [${allowedCtors.map(c => c.typeName).join(', ')}])`,
    getChildCodecs: () => [refCodec],
    validateWithState: (input, context, state) => {
      const entityEither = refCodec.validateWithState(input, context, state);
      return validateHandle(entityEither, refHandleCtor, state);
    },
    is: (value): value is AnyAllowedHandle<RefHandleCtor, AllowedCtors> => (
      // Note that this is the only place that `allowedCtors` is used, other
      // than in the types. For decoding we simply use `refHandleCodec`, and for
      // encoding we simply assert that the type of the `Handle` is
      // `refHandleCtor` before using `refHandleCodec`.
      value instanceof DecodedHandle && (
        value.type === refHandleCtor ||
        allowedCtors.includes(value.type as IAnyEntityConstructorWithId<unknown>)
      )
    ),
    encodeWithState: (value, state) => {
      return refCodec.encodeWithState(
        {
          id: value.id,
          [ViewModelFields.Type]: refHandleCtor.typeName,
        },
        state,
      );
    },
    encodeDiffWithState: (oldValue, newValue, state) => {
      return refCodec.encodeDiffWithState(
        {
          id: oldValue.id,
          [ViewModelFields.Type]: refHandleCtor.typeName,
        },
        {
          id: newValue.id,
          [ViewModelFields.Type]: refHandleCtor.typeName,
        },
        state,
      );
    },
  });
}

export class EncodedRefHandleType<
  C extends IAnyEntityConstructorWithId,
>
extends ViewModelCodec<
  Handle<C, IdForConstructor<C>>,
  OutputTypeOf<NestedType<C>> | IRefObject,
  DecodedHandle<C, DecodedIdForConstructor<C>>
> {
  public readonly entityConstructor: C;
  public readonly type: NestedType<C>;

  public constructor(entityConstructor: C) {
    const codec = new NestedType(entityConstructor);
    type F = C['fields'];
    type TypeName = C['typeName'];
    const encodedRefCodec = encodedRef<
      F,
      IRefable<F, TypeName> & Entity<C>,
      IRefable<F, TypeName> & DecodedEntity<C>,
      TypeName
    // The types are incompatible because we are requiring that the entity
    // constructor has an `id` field using the `fields` property, but this has
    // no direct effect on the fields of the `Entity<C>` type.
    // @ts-expect-error the id types are incompatible
    >(codec);

    super({
      name: `encodedRefHandle(${codec.typeName})`,
      getChildCodecs: () => [codec],
      is: (value: unknown): value is Handle<C, IdForConstructor<C>> => (
        value instanceof Handle && value.type === entityConstructor
      ),
      validateWithState: (input, context, state) => {
        const entityEither = encodedRefCodec.validateWithState(input, context, state);
        return validateHandle(entityEither, entityConstructor, state);
      },
      encodeWithState: (handle, state) => {
        const entity = state.get(encodingEntityDbKey).get(handle);

        updateOldEntities(entityConstructor, handle, state);

        if (!entity) throw new Error(`Could not find entity for handle ${handle.toString()}`);
        // @ts-expect-error the id types are incompatible
        return encodedRefCodec.encodeWithState(entity, state);
      },
      encodeDiffWithState: (oldHandle, newHandle, state) => {
        const newEntity = state.get(encodingEntityDbKey).get(newHandle);
        const oldEntity = state.get(fromEntityDbKey).get(oldHandle);
        if (!oldEntity) throw new Error(`Could not find entity for handle ${oldHandle.toString()}`);
        if (!newEntity) throw new Error(`Could not find entity for handle ${newHandle.toString()}`);
        // @ts-expect-error the id types are incompatible
        return encodedRefCodec.encodeDiffWithState(oldEntity, newEntity, state);
      },
    });

    this.entityConstructor = entityConstructor;
    this.type = codec;
  }
}

const validateHandle = <
  C extends IAnyEntityConstructorWithId,
>(
  entityEither: Validation<DecodedEntity<C>>,
  entityConstructor: C,
  state: StateContainer,
): Validation<DecodedHandle<C, IdForConstructor<C>>> => {
  if (isLeft(entityEither)) {
    return entityEither;
  }
  const entity = entityEither.right;

  const handle = new DecodedHandle<
    C,
    IdForConstructor<C>
  >(entityConstructor, entity);

  state.update(decodingEntityDbKey, (db) => db.set(handle, entity));

  return right(handle);
};

/**
 * Takes a handle and updates the {@link oldEntitiesDbKey} DB to include the old
 * version of the entity contained in the {@link fromEntityDbKey} DB. This
 * complements the `firstPassState` logic in `encodeDiffRequest`, which adds all
 * of the entities in `fromValue`/`fromDb` to the {@link oldEntitiesDbKey} DB.
 * Because {@link Handle}s also may contain an internal fallback entity, this
 * logic is necessary to extract the internal fallback entity in case it is not
 * explicitly inserted into the `fromDb`.
 */
const updateOldEntities = (
  ctor: IAnyEntityConstructorWithId,
  handle: Handle<IAnyEntityConstructorWithId>,
  state: StateContainer,
) => {
  const oldEntities = state.get(oldEntitiesDbKey);
  if (oldEntities) {
    const fromDb = state.get(fromEntityDbKey);
    const oldEntity = (handle instanceof DangerousHandle && !fromDb.has(handle)) ? undefined : fromDb.get(handle);
    if (oldEntity) {
      const idField = ctor.fields[ViewModelFields.Id] as ViewModelCodec<unknown> | undefined;
      const id = idField?.encodeWithState(oldEntity[ViewModelFields.Id], state);
      const key = new TypeIdRecord({
        type: ctor.typeName,
        id,
      });
      state.set(oldEntitiesDbKey, oldEntities.set(key, oldEntity));
    }
  }
};

/**
 * When decoding, returns a `DecodedHandle` object which can be used to get the
 * referenced entity in the `DecodedEntityDB` returned by `decodeResponse()`.
 *
 * When encoding, expects either a `DecodedHandle` or a `Handle` object which
 * references an entity in the `EntityDB` passed to `encodeRequest()`/`encodeDiffRequest()`.
 */
export const handle = constructorAsFunc(HandleType);

/**
 * Same as `handle()`, but when decoding it expects the entity to be be encoded
 * as a reference object (i.e. `{ _ref: '<some string>' }`, with the actual
 * entity data stored inside the `references` field of the API response object.
 *
 * When encoding, the entity data is also stored inside the `references` field,
 * but only the entity's `id` and `_type` are encoded. Additionally, it will use
 * the ID/type from the given `Handle` object directly, without trying to get
 * the corresponding entity in the given `EntityDB`. This means that it's
 * possible to encode a reference to an entity even if you only know its type
 * and ID, and don't have a local copy of. This can be useful in cases where you
 * want an entity to simply reference another already existing entity, without
 * modifying the existing entity.
 */
export const refHandle = constructorAsFunc(RefHandleType);

/**
 * Same as `handle()`, but when decoding it expects the entity to be be encoded
 * as a reference object (i.e. `{ _ref: '<some string>' }`, with the actual
 * entity data stored inside the `references` field of the API response object.
 *
 * When encoding, the entity data is also stored inside the `references` field,
 * and all of the entity's fields are encoded (unlike `refHandle()`). The
 * `Handle` object must reference an entity in the `EntityDB` passed to
 * `encodedRequest()`/`encodeDiffRequest()` (also unlinke `refHandle()`).
 */
export const encodedRefHandle = constructorAsFunc(EncodedRefHandleType);
