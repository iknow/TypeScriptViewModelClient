/* eslint-disable @typescript-eslint/member-ordering */
import { Map, is } from 'immutable';
import {
  IAnyEntityConstructor,
  AnyEntity,
  AnyDecodedEntity,
} from '../shared/Entity';
import ViewModelFields from '../shared/ViewModelFields';
import Handle, {
  AnyHandle,
  AnyDecodedHandle,
  EntityForHandle,
  DecodedEntityForHandle,
  DecodedHandle,
  DangerousHandle,
  INTERNAL_ENTITY_PROPERTY_KEY,
  INTERNAL_DECODED_ENTITY_PROPERTY_KEY,
} from './Handle';

// Because `IEntityConstructor` (and therefore `Entity`) contains a codec,
// TypeScript expects the types to be compatible in both directions (encoding
// and decoding). This means using safer type arguments (e.g.
// `IEntityType<unknown, string>` or similar) results in many type errors, so
// we have to use `any`.
type InternalEntityDB = Map<AnyHandle, AnyEntity>;

const emptyInternalDb: InternalEntityDB = Map();

/**
 * Abstract base class for {@link EntityDB} and {@link DecodedEntityDB}.
 * Can be used as an argument type for functions which need to accept either an
 * `EntityDB` or `DecodedEntityDB`.
 *
 * Using `EntityDB | DecodedEntityDB` sometimes causes type errors because
 * TypeScript isn't able to tell that the call signatures are actually compatible, e.g.:
 * the method overloads distributed over the union type. For example calling `.getOrThrow`:
 *
 * ```
 * Each member of the union type '(
 * <H extends AnyHandle>(handle: H) => EntityForHandle<H>) |
 * {
 *   <H extends AnyDecodedHandle>(handle: H): DecodedEntityForHandle<H>;
 *   <H extends AnyHandle>(handle: H): DecodedEntityForHandle<...>;
 * }' has signatures, but none of those signatures are compatible with each other. [2349]
 * ```
 *
 * Related to https://github.com/microsoft/TypeScript/issues/7294.
 */
export abstract class BaseEntityDB {
  protected readonly internalMap: InternalEntityDB;

  protected constructor(map: InternalEntityDB) {
    this.internalMap = map;
  }

  /**
   * Returns true if this {@link EntityDB} is equivalent to what would be
   * returned by calling {@link EntityDB.from} with the given {@link EntityDB}
   * or {@link DecodedEntityDB}. Effectively allows doing a referential equality
   * comparison between an {@link EntityDB} and {@link DecodedEntityDB}.
   */
  public equals(entityDb: BaseEntityDB): boolean {
    return this.internalMap === entityDb.internalMap;
  }

  /**
   * The behavior of `.get` is different for {@link EntityDB} and
   * {@link DecodedEntityDB}. See the documentation on each `.get` method
   * implementation for details.
   */
  public abstract get<H extends AnyDecodedHandle>(
    handle: H,
    // If the handle is a `DecodedHandle`, then we know that `undefined` will never be returned.
  ): EntityForHandle<H>;
  public abstract get<H extends AnyHandle>(
    handle: H,
  ): EntityForHandle<H> | undefined;

  protected getInternal<H extends AnyHandle>(
    handle: H,
  ): EntityForHandle<H> | undefined {
    return this.internalMap.get(handle) as (EntityForHandle<H> | undefined);
  }

  /**
   * @deprecated Use {@link get} instead.
   */
  public getOrThrow<H extends AnyHandle>(
    handle: H,
  ): EntityForHandle<H> {
    const result = this.get(handle);

    if (result === undefined) {
      throw new Error(`Could not find entity for handle ${handle.toString()}`);
    }

    return result;
  }

  /**
   * Returns true if there is an entity associated with the given handle.
   *
   * Note that unlike {@link get}, {@link has} does not have special fallback
   * behavior for {@link DecodedHandle} or {@link Handle}. If this {@link EntityDB}
   * does not have an entity associated with the given handle, it will return
   * false even if the `handle` passed was not created with {@link Handle.dangerouslyCreateFromTypeAndId}.
   */
  public has(handle: AnyHandle): boolean {
    return this.getInternal(handle) !== undefined;
  }

  protected setInternal(
    handle: AnyHandle,
    newValue: AnyEntity | undefined,
  ): InternalEntityDB {
    const internalValue = this.getInternal(handle);
    if (is(newValue, internalValue)) {
      return this.internalMap;
    } else if (newValue === undefined) {
      return this.internalMap.delete(handle);
    } else {
      return this.internalMap.set(handle, newValue);
    }
  }

  protected mergeInternal(otherMap: InternalEntityDB): InternalEntityDB {
    if (this.internalMap === emptyInternalDb) {
      return otherMap;
    }
    if (otherMap === emptyInternalDb) {
      return this.internalMap;
    }
    return this.internalMap.merge(otherMap);
  }

  /**
   * Returns an iterator of all of the entities in this `EntityDB`.
   */
  public entities() {
    return this.internalMap.values();
  }

  /**
   * Returns an iterator of all of the entries in this `EntityDB`, as tuples of
   * `[Handle, Entity]`.
   */
  public entries() {
    return this.internalMap.entries();
  }

  /**
   * Returns an arbitrary representation of this `EntityDB` as a plain JS
   * object. Intended for debugging and testing purposes only.
   */
  public toJS(): unknown {
    const result: Record<string, unknown> = {};
    for (const [handle, entity] of this.entries()) {
      result[String(handle)] = entity.toJS();
    }
    return result;
  }
}

/**
 * An immutable data structure for mapping from `Handle` objects to immutable
 * `Entity` objects (i.e. objects created via `entityConstructor()`'s
 * constructor or its codec). Used to represent nested trees of entities in a
 * normalized way, which can make it easier and more performant to use entities
 * inside deeply nested React components.
 */
export default class EntityDB extends BaseEntityDB {
  /**
   * An `EntityDB` with no entities.
   *
   * To create an `EntityDB` instance, instead of using the constructor (which
   * is private), call a method on `EntityDB.emptyDb` to create a modified
   * instance.
   */
  public static readonly emptyDb = new EntityDB(emptyInternalDb);

  /**
   * This property is here to guarantee that `EntityDB` and `DecodedEntityDB`
   * are not type-compatible so that they cannot be accidentally used
   * interchangeably.
   *
   * For example, if they were type-compatible, then some code could do this
   * without getting type errors:
   *
   * ```ts
   * const remoteDb: DecodedEntityDB = ...;
   * const localDb: EntityDB = remoteDb;
   * ```
   *
   * But then if something calls `localDb.getOrThrow(handle)` and passes in a
   * non-decoded `Handle`, it will actually be calling the `DecodedEntityDB`'s
   * implementation which specifically avoids returning the local versions of
   * entities, so it will throw.
   *
   * This is `protected` property so that TypeScript doesn't complain about the
   * fact that this property is never used.
   */
  protected readonly notCompatibleWithDecodedEntityDb = true;

  /**
   * Even though the public interface of {@link DecodedEntityDB} is compatible
   * with {@link EntityDB}, they have slightly different runtime behavior and
   * are not interchangable: {@link EntityDB} is for looking up local updates to
   * entities, and {@link DecodedEntityDB} is for looking up remote updates to
   * entities.
   *
   * Use {@link from} if you need to create an {@link EntityDB} instance that
   * contains that same state as a {@link DecodedEntityDB} instance. For example:
   *
   * ```ts
   * const remoteDb: DecodedEntityDB = ...;
   * const localDb: EntityDB = EntityDB.from(remoteDb);
   * ```
   */
  public static from(entityDb: BaseEntityDB): EntityDB {
    if (entityDb instanceof EntityDB) return entityDb;

    // We want `internalMap` to be hidden from the public API, but this is an
    // internal API so we ignore the fact that it is `protected`.
    return new EntityDB((entityDb as unknown as {
      internalMap: InternalEntityDB;
    }).internalMap);
  }

  /**
   * If this {@link EntityDB} has an entity associated with the given handle,
   * returns the {@link EntityDB}'s entity.
   *
   * Otherwise:
   *
   * - If passed a {@link DecodedHandle} or {@link Handle} it will fall back to
   * returning the handle's internal entity.
   * - If passed a handle created with {@link Handle.dangerouslyCreateFromTypeAndId},
   * an error will be thrown.
   */
  public override get<H extends AnyHandle>(
    handle: H,
  ): EntityForHandle<H> {
    const result = this.getInternal(handle);
    if (result !== undefined) return result;
    if (handle instanceof Handle && !(handle instanceof DangerousHandle)) {
      return handle[INTERNAL_ENTITY_PROPERTY_KEY] as EntityForHandle<H>;
    }
    throw new Error(`Could not find entity for handle ${handle.toString()}`);
  }

  /**
   * Returns a new `EntityDB` with the entity associated with the given handle
   * removed. If there is no entity for the handle, returns `this`.
   */
  public delete(handle: AnyHandle): EntityDB {
    return this.asEntityDb(this.setInternal(handle, undefined));
  }

  /**
   * Returns a new `EntityDB` with the given entity associated with the given
   * handle. If `value` is the same (according to `Immutable.is`) as the
   * existing value associated with the handle, returns `this`.
   */
  public set<H extends AnyHandle>(
    handle: H,
    value: EntityForHandle<H>,
  ): EntityDB {
    return this.asEntityDb(this.setInternal(handle, value));
  }

  /**
   * Returns a new `EntityDB` with the given handle associated with the return
   * value of calling the given function with the current value associated with
   * the handle. The updater function can return `undefined` to delete the
   * entity. If the updated value is the same (according to `Immutable.is`) as
   * the existing value, returns `this`.
   */
  public update<H extends AnyHandle>(
    handle: H,
    updater: (e: EntityForHandle<H>) => EntityForHandle<H> | undefined,
  ): EntityDB {
    const value = this.get(handle);
    const newValue = updater(value);
    return this.asEntityDb(this.setInternal(handle, newValue));
  }

  /**
   * @deprecated In most cases this isn't necessary anymore because you can use
   * a {@link DecodedHandle} to ensure that a handle is always resolve-able even
   * if `.set` has not been explicitly called. If you do need this for some
   * reason, prefer using `.set` and `new Handle` explicitly.
   *
   * Shorthand for `.set(new Handle(entityConstructor, value.id), value)`.
   */
  public setEntity(
    value: AnyEntity & { [ViewModelFields.Id]: unknown; },
  ): EntityDB {
    if (value.id === undefined) {
      // Because `Handle`s with an undefined `id` use referential equality, you
      // would never be able to get the entity back if you inserted because
      // `.setEntity` does not return the `Handle` it creates.
      throw new Error('Cannot call .setEntity with an entity that has an undefined `id`.');
    }

    const handle = new Handle(value.constructor as IAnyEntityConstructor, value);
    return this.set(handle, value);
  }


  /**
   * Returns a new `EntityDB` with the contents of the given `EntityDB` merged
   * on top of the contents of `this`.
   */
  public merge(db: EntityDB): EntityDB {
    return this.asEntityDb(this.mergeInternal(db.internalMap));
  }

  private asEntityDb(updatedInternalMap: InternalEntityDB): EntityDB {
    if (this.internalMap === updatedInternalMap) {
      return this;
    }
    return new EntityDB(updatedInternalMap);
  }
}

/**
 * Conceptually the same as `EntityDB`, but with the methods that return/accept
 * `DecodedEntity` instead of `Entity`. This is returned as `entityDb` from
 * `decodeResponse`, and should not be constructed directly in most cases.
 *
 * Note that there is a small difference in the runtime behavior of
 * `DecodedEntityDB` and `EntityDB`: if a `Handle` is passed to
 * `.get`/`.getOrThrow` on `EntityDB`, then it will fall back to returning the
 * `Handle`s internal entity, but because `DecodedEntityDB` only returns
 * `DecodedEntity` instances, it will only return a fallback when passed a
 * `DecodedHandle`, not when passed a `Handle`.
 *
 * However, because `DecodedEntity` types are compatible with `Entity` types,
 * you can create an `EntityDB` instance with the same state as a
 * `DecodedEntityDB` instance using `v.EntityDB.from(decodedEntityDb)`.
 */
export class DecodedEntityDB extends BaseEntityDB {
  /**
   * An `DecodedEntityDB` with no entities.
   *
   * To create an `DecodedEntityDB` instance, instead of using the constructor
   * (which is private), call a method on `DecodedEntityDB.emptyDb` to create a
   * modified instance.
   */
  public static readonly emptyDb = new DecodedEntityDB(emptyInternalDb);

  /**
   * Returns the entity associated with the given handle if it exists, otherwise
   * returning `undefined`.
   *
   * If passed a {@link DecodedHandle} and this {@link DecodedEntityDB} does not have
   * an entry for the given `handle`, this will return the handle's internal
   * entity (the entity passed to the constructor when the handle was created)
   * as a fallback. However, if passed a {@link Handle} it may return `undefined`.
   */

  /**
   * If this {@link DecodedEntityDB} has an entity associated with the given handle,
   * returns the {@link DecodedEntityDB}'s entity.
   *
   * Otherwise:
   *
   * - If passed a {@link DecodedHandle} it will fall back to returning the
   * handle's internal entity.
   * - If passed a {@link Handle} it will return `undefined`, because the
   * internal entity for {@link Handle} is not compatible with {@link DecodedEntity}.
   * - If passed a handle created with {@link Handle.dangerouslyCreateFromTypeAndId},
   * an error will be thrown.
   */
  public override get<H extends AnyDecodedHandle>(
    handle: H,
    // If the handle is a `DecodedHandle`, then we know that `undefined` will never be returned.
  ): DecodedEntityForHandle<H>;
  public override get<H extends AnyHandle>(
    handle: H,
  ): DecodedEntityForHandle<H> | undefined;
  public override get<H extends AnyHandle>(
    handle: H,
  ): DecodedEntityForHandle<H> | undefined {
    const result = this.getInternal(handle);
    if (result !== undefined) return result as DecodedEntityForHandle<H>;
    if (handle instanceof DecodedHandle && !(handle instanceof DangerousHandle)) {
      return handle[INTERNAL_DECODED_ENTITY_PROPERTY_KEY] as DecodedEntityForHandle<H>;
    }
    if (handle instanceof Handle && !(handle instanceof DangerousHandle)) {
      return undefined;
    }
    throw new Error(`Could not find entity for handle ${handle.toString()}`);
  }

  /**
   * @deprecated Use `.get` instead.
   */
  public override getOrThrow<H extends AnyHandle>(
    handle: H,
  ): DecodedEntityForHandle<H> {
    return super.getOrThrow(handle) as DecodedEntityForHandle<H>;
  }

  /**
   * Returns a new `DecodedEntityDB` with the entity associated with the given
   * handle removed. If there is no entity for the handle, returns `this`.
   */
  public delete<H extends AnyHandle>(
    handle: H,
  ): DecodedEntityDB {
    return this.asDecodedEntityDb(this.setInternal(handle, undefined));
  }

  /**
   * Returns a new `DecodedEntityDB` with the given entity associated with the
   * given handle. If `value` is the same (according to `Immutable.is`) as the
   * existing value associated with the handle, returns `this`.
   */
  public set<H extends AnyHandle>(
    handle: H,
    value: DecodedEntityForHandle<H>,
  ): DecodedEntityDB {
    return this.asDecodedEntityDb(this.setInternal(handle, value));
  }

  /**
   * Returns a new `DecodedEntityDB` with the given handle associated with the
   * return value of calling the given function with the current value
   * associated with the handle. The updater function can return `undefined` to
   * delete the entity. If the updated value is the same (according to
   * `Immutable.is`) as the existing value, returns `this`.
   */
  public update<H extends AnyDecodedHandle>(
    handle: H,
    updater: (e: DecodedEntityForHandle<H>) => DecodedEntityForHandle<H> | undefined,
  ): DecodedEntityDB;
  public update<H extends AnyHandle>(
    handle: H,
    // The linting rule claims that these overloads could be combined into a
    // single signature, but that is wrong because we want the types to be
    // different when passing in a `DecodedHandle` vs. a `Handle`.
    //
    // eslint-disable-next-line @typescript-eslint/unified-signatures
    updater: (e: DecodedEntityForHandle<H> | undefined) => DecodedEntityForHandle<H> | undefined,
  ): DecodedEntityDB;
  public update<H extends AnyHandle>(
    handle: H,
    updater: (e: DecodedEntityForHandle<H>) => DecodedEntityForHandle<H>,
  ): DecodedEntityDB {
    const value = this.get(handle);
    // The overloads for .update match the overloads for .get, so this is safe in practice.
    const newValue = updater(value as DecodedEntityForHandle<H>);
    return this.asDecodedEntityDb(this.setInternal(handle, newValue));
  }

  /**
   * @deprecated In most cases this isn't necessary anymore because you can use
   * a {@link DecodedHandle} to ensure that a handle is always resolve-able even
   * if `.set` has not been explicitly called. If you do need this for some
   * reason, prefer using `.set` and `new Handle` explicitly.
   *
   * Shorthand for `.set(new Handle(entityConstructor, value.id), value)`.
   */
  public setEntity(
    value: AnyDecodedEntity & { [ViewModelFields.Id]: unknown; },
  ): DecodedEntityDB {
    if (value.id === undefined) {
      // Because `Handle`s with an undefined `id` use referential equality, you
      // would never be able to get the entity back if you inserted because
      // `.setEntity` does not return the `Handle` it creates.
      throw new Error('Cannot call .setEntity with an entity that has an undefined `id`.');
    }

    const handle = new DecodedHandle(value.constructor as IAnyEntityConstructor, value);
    return this.set(handle, value);
  }

  /**
   * Returns a new `DecodedEntityDB` with the contents of the given
   * `DecodedEntityDB` merged on top of the contents of `this`.
   */
  public merge(db: DecodedEntityDB): DecodedEntityDB {
    return this.asDecodedEntityDb(this.mergeInternal(db.internalMap));
  }

  private asDecodedEntityDb(updatedInternalMap: InternalEntityDB): DecodedEntityDB {
    if (this.internalMap === updatedInternalMap) {
      return this;
    }
    return new DecodedEntityDB(updatedInternalMap);
  }
}
