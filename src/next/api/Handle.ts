/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Immutable from 'immutable';
import EntityDB, { BaseEntityDB, DecodedEntityDB } from '../api/EntityDB';
import type encodeRequest from '../api/encodeRequest';
import type encodeDiffRequest from '../api/encodeDiffRequest';
import {
  IEntityConstructor,
  IAnyEntityConstructor,
  DecodedEntity,
  Entity,
  AnyEntity,
  AnyDecodedEntity,
} from '../shared/Entity';
import { TypeOf, DecodedTypeOf } from './ViewModelCodec';

export type IdForConstructor<T extends IAnyEntityConstructor> = (
  T extends IEntityConstructor<infer F, any> ? TypeOf<F['id']> : never
);

export type DecodedIdForConstructor<T extends IAnyEntityConstructor> = (
  T extends IEntityConstructor<infer F, any> ? DecodedTypeOf<F['id']> : never
);

export const INTERNAL_ENTITY_PROPERTY_KEY = '@@internalEntity';
export const INTERNAL_DECODED_ENTITY_PROPERTY_KEY = '@@internalDecodedEntity';

/**
 * Key that can be used to get and set entities in an `EntityDB`. `Handle` and
 * `EntityDB` together are used to support representing entities in a normalized
 * way (versus representing them as nested objects).
 *
 * Implements the ImmutableJS `ValueObject` interface
 * (https://immutable-js.github.io/immutable-js/docs/#/ValueObject) so it can be
 * used as a key in `Immutable.Map`s.
 *
 * A `Handle` has an entity associated with it, and it will return that entity
 * when the `Handle` is used to look up the entity in an `EntityDB` that
 * doesn't have an entry for the given entity (regardless of whether this is
 * done via calling `.get` on the `EntityDB`, or via calling
 * `.resolve` on the `Handle`). If the `EntityDB` does have an entry for the
 * entity, though, that will be returned instead of using the `Handle`'s
 * internal entity.
 *
 * If a handle's `id` is `undefined`, it will use referential equality when
 * doing equality checks (i.e. when using it with an `EntityDB` or inside an
 * ImmutableJS Map or when using `.equals()` directly). Otherwise, two handles
 * will be considered equal if their `type` and `id` are the same.
 */
export default class Handle<
  T extends IAnyEntityConstructor,
  IdType = IdForConstructor<T>,
> implements Immutable.ValueObject {
  public readonly type: T;
  public readonly id: IdType;

  public readonly [INTERNAL_ENTITY_PROPERTY_KEY]: Entity<T>;

  public constructor(type: T, entity: Entity<T>) {
    this.type = type;
    this.id = entity.id;

    this[INTERNAL_ENTITY_PROPERTY_KEY] = entity;
    // Make the internal entity property non-enumerable so it does not affect test
    // expectations that compare different kinds of handles (e.g. when
    // comparing different entities with a deep equality check, and those
    // entities contain fields with handles, and one side of the comparison has
    // a `Handle` but the other side has a `DecodedHandle`, but we want them to
    // be considered equal as long as their type and ID are the same).
    Object.defineProperty(this, INTERNAL_ENTITY_PROPERTY_KEY, { enumerable: false });
  }

  /**
   * Creates a {@link DangerousHandle} (which is type-compatible with {@link
   * DecodedHandle}) which can be used when encoding references to entities, but
   * which may throw an error if trying to read or encode the referenced
   * entity's data. For example, encoding a {@link DangerousHandle} with
   * the `handle()` or `encodedRefHandle()` codecs may throw, and calling the
   * `.resolve` method on a {@link DangerousHandle} or passing it to the `.get`
   * method of {@link EntityDB} or {@link DecodedEntityDB} may throw.
   *
   * The only time this should be used is when:
   *
   * 1) creating a handle which will immediately be passed to {@link encodeRequest} or
   * {@link encodeDiffRequest} and won't otherwise be used,
   * 2) the handle is being passed to a field using the `refHandle()` or
   * `assertedRefHandle()` codecs, and
   * 3) you only know the entity's type+ID and don't already have a real
   * {@link DecodedHandle} that you can pass.
   */
  public static dangerouslyCreateFromTypeAndId<
    InnerT extends IAnyEntityConstructor,
    InnerIdType = IdForConstructor<InnerT>,
  >(type: InnerT, id: InnerIdType): DangerousHandle<InnerT, InnerIdType> {
    return new DangerousHandle(type, id);
  }

  /**
   * Equivalent to `this.type.typeName`. Exposed so that the handle's
   * `.typeName` property can be used as a discriminant property for
   * discriminated unions. For example:
   *
   * ```
   * const someHandle: v.DecodedHandle<typeof EntityA> | v.DecodedHandle<typeof EntityB> = ...;
   * switch (someHandle.typeName) {
   *   case 'EntityA': ...
   *   case 'EntityB': ...
   *   default: assertAllCasesHandled(someHandle);
   * }
   * ```
   *
   * When using an entity instead of a handle, the `._type` property is
   * equivalent to the entity type's `typeName` and it can be used as a
   * discriminant property instead.
   */
  public get typeName(): T['typeName'] {
    return this.type.typeName;
  }

  /**
   * @deprecated Avoid passing {@link DecodedEntityDB} to `.resolve` with {@link Handle}
   * objects, because locally-created handles will never exist in the {@link DecodedEntityDB}
   * so it will always throw.
   *
   * When working with decoded entities, use {@link DecodedHandle} instead of {@link Handle}.
   *
   * When working with locally created entities, use {@link EntityDB} instead of {@link DecodedEntityDB}.
   */
  public resolve(entityDb: DecodedEntityDB): DecodedEntity<T> | undefined;
  /**
   * `handle.resolve(entityDb)` is equivalent to `entityDb.get(handle)`.
   * It can be passed either an `EntityDB` or `DecodedEntityDB` and will return
   * an `Entity` or `DecodedEntity` type respectively.
   *
   * Convenient for chaining calls to `.resolve` together, potentially with `?.`
   * operators in between calls to handle nullable fields. For example:
   *
   * ```
   * const someValue = (
   *   entity.handleField.resolve(db)     // Assuming handleField: v.handle(SomeEntity)
   *   .nullableHandleField.resolve(db)  // Assuming nullableHandleField: v.nullable(v.handle(SomeOtherEntity))
   *   ?.value
   * );
   * ```
   */
  public resolve(entityDb: EntityDB): Entity<T>;
  public resolve(entityDb: BaseEntityDB): AnyEntity | AnyDecodedEntity | undefined {
    return entityDb.get(this);
  }

  /**
   * For `Immutable.is()` support
   */
  public equals(other: unknown): boolean {
    // Handles with `undefined` identifiers can only be referentially equal.
    if (this.id === undefined) return this === other;
    return other instanceof Handle && this.type === other.type && this.id === other.id;
  }

  /**
   * For `Immutable.is()` support
   */
  public hashCode(): number {
    return Immutable.hash(`${Immutable.hash(this.type)}:${String(this.id)}`);
  }

  /**
   * For debugging/testing only
   */
  public toString(): string {
    return `${this.type.typeName}/${String(this.id)}`;
  }

  /**
   * For debugging/testing only
   */
  public toJS(): unknown {
    return this.toString();
  }
}

/**
 * A `DecodedHandle` is like a `Handle` but it has a `DecodedEntity` associated
 * with it, instead of an `Entity`. This means the associated `DecodedEntity`
 * can be returned as a fallback when looking up the handle in a
 * `DecodedEntityDB`, in addition to when looking up the handle in an `EntityDB`.
 *
 * See the `DecodedHandle` section in the README for a more complete
 * explanation of why `DecodedHandle` is useful and how it can be used.
 */
export class DecodedHandle<
  T extends IAnyEntityConstructor,
  IdType = DecodedIdForConstructor<T>,
> extends Handle<T, IdType> {
  public readonly [INTERNAL_DECODED_ENTITY_PROPERTY_KEY]: DecodedEntity<T>;

  public constructor(type: T, decodedEntity: DecodedEntity<T>) {
    super(type, decodedEntity);
    this[INTERNAL_DECODED_ENTITY_PROPERTY_KEY] = decodedEntity;
    // Make the internal entity property non-enumerable so it does not affect test
    // expectations that compare different kinds of handles (e.g. when
    // comparing different entities with a deep equality check, and those
    // entities contain fields with handles, and one side of the comparison has
    // a `Handle` but the other side has a `DecodedHandle`, but we want them to
    // be considered equal as long as their type and ID are the same).
    Object.defineProperty(this, INTERNAL_DECODED_ENTITY_PROPERTY_KEY, { enumerable: false });
  }

  // Override the overloads in `DecodedHandle` because we don't want
  // `.resolve(v.DecodedEntityDB`)` to be marked as @deprecated when using a
  // `DecodedHandle` (only when using a `Handle`).
  public override resolve(entityDb: DecodedEntityDB): DecodedEntity<T>;
  public override resolve(entityDb: EntityDB): Entity<T>;
  public override resolve(entityDb: BaseEntityDB): AnyEntity | AnyDecodedEntity {
    // Because `this` is a `DecodedHandle`, it won't return `undefined` even
    // when passed to a `DecodedEntityDB`.
    return entityDb.get(this) as AnyEntity | AnyDecodedEntity;
  }
}

export class DangerousHandle<
  T extends IAnyEntityConstructor,
  IdType = IdForConstructor<T>,
> extends DecodedHandle<T, IdType> {
  public constructor(type: T, id: IdType) {
    // The actual entity object itself will never be used because `EntityDB`
    // has a special case for `DangerousHandle`, so we just need to pass in an
    // object with an .id property.
    super(type, { id } as unknown as DecodedEntity<T>);
  }
}

/**
 * Checking `someDecodedHandle.type === SomeEntity` is not enough to refine the
 * type of an arbitrary `DecodedHandle` to `DecodedHandle<typeof SomeEntity>`.
 * This is a custom type guard that allows us to do this type refinement easily.
 *
 * Note that if you have a value whos type is a union of multiple DecodedHandle
 * types, then instead of using this type guard you can check the `.typeName`
 * property to refine the type.
 */
export function isDecodedHandleOf<Ctor extends IAnyEntityConstructor>(
  ctor: Ctor,
  inputHandle: unknown,
): inputHandle is DecodedHandle<Ctor> {
  return inputHandle instanceof DecodedHandle && inputHandle.type === ctor;
}

/**
 * Checking `someHandle.type === SomeEntity` is not enough to refine the type of
 * an arbitrary `Handle` to `Handle<typeof SomeEntity>`. This is a custom type
 * guard that allows us to do this type refinement easily.
 *
 * Note that if you have a value whos type is a union of multiple Handle
 * types, then instead of using this type guard you can check the `.typeName`
 * property to refine the type.
 */
export function isHandleOf<Ctor extends IAnyEntityConstructor>(
  ctor: Ctor,
  inputHandle: unknown,
): inputHandle is Handle<Ctor> {
  return inputHandle instanceof Handle && inputHandle.type === ctor;
}

/**
 * Helper that accepts any Handle type. Useful for `extends` constraints in
 * type arguments.
 */
export type AnyHandle = Handle<IAnyEntityConstructor, any>;
export type AnyDecodedHandle = DecodedHandle<IAnyEntityConstructor, any>;
/**
 * Helper for getting an entity type that corresponds to the given handle type.
 * Useful when using {@link AnyHandle} as a type argument constraint.
 */
export type EntityForHandle<H extends AnyHandle> = H extends Handle<infer C, any> ? Entity<C> : never;
/**
 * Helper for getting a decoded entity type that corresponds to the given handle type.
 * Useful when using {@link AnyHandle} as a type argument constraint.
 */
export type DecodedEntityForHandle<H extends AnyHandle> = H extends Handle<infer C, any> ? DecodedEntity<C> : never;
