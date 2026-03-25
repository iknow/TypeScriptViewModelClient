import * as Immutable from 'immutable';

// Hidden symbol used to ensure that `createKey()` is the only way to create
// `IStateKey` objects.
const internalSymbol = Symbol('internalSymbol');

export interface IStateKey<T> {
  readonly [internalSymbol]: symbol;
  readonly defaultValue: T;
}

/**
 * `ImmutableStateContainer` is essentially an ImmutableJS `Map`, but with the
 * constraint that the keys must be created using
 * `ImmutableStateContainer.createKey()`. This allows a unique type to be
 * associated with each key, so the `ImmutableStateContainer` is extensible and
 * can store arbitrary types that are defined externally. It also allows a
 * default value to be associated with each key, and avoids naming conflicts
 * because the keys are unique objects.
 */
export class ImmutableStateContainer {
  public static emptyState = new ImmutableStateContainer(Immutable.Map());

  private internalMap: Immutable.Map<symbol, unknown>;

  private constructor(map: Immutable.Map<symbol, unknown>) {
    this.internalMap = map;
  }

  public static createKey<T>(this: void, defaultValue: T): IStateKey<T> {
    return Object.freeze({
      [internalSymbol]: Symbol('state key'),
      defaultValue,
    });
  }

  public get<T>(key: IStateKey<T>): T {
    if (this.internalMap.has(key[internalSymbol])) {
      // This type assertion is safe under the assumption that each
      // `key[internalSymbol]` is associated with a unique type `T`. This should
      // always be true because `createKey()` is the only way to create a valid
      // `IStateKey`, since `internalSymbol` is not exposed.
      return this.internalMap.get(key[internalSymbol]) as T;
    } else {
      return key.defaultValue;
    }
  }

  public set<T, ValueT extends T>(key: IStateKey<T>, value: ValueT): ImmutableStateContainer {
    return this.update(key, () => value);
  }

  public update<T, ValueT extends T>(key: IStateKey<T>, updater: (current: T) => ValueT): ImmutableStateContainer {
    const currentValue = this.get(key);
    const value = updater(currentValue);
    if (value === currentValue) {
      return this;
    }

    return new ImmutableStateContainer(
      this.internalMap.set(key[internalSymbol], value),
    );
  }

  public reset<T>(key: IStateKey<T>): ImmutableStateContainer {
    if (!this.internalMap.has(key[internalSymbol])) {
      return this;
    }

    return new ImmutableStateContainer(
      this.internalMap.delete(key[internalSymbol]),
    );
  }
}

/**
 * Essentially a `{ current: ImmutableStateContainer }` object, but with helpers for
 * updating the `.current` property, mainly to avoid having to add
 * `eslint-disable-next-line no-param-reassign` comments everywhere.
 *
 * This approach is used so that the keys in a `StateContainer` can be mutated,
 * but at the same time you can access the `StateContainer`'s `.current`
 * proprety to get an immutable snapshot of the state that will not be affected
 * by later mutations. This is required to support "branching" during decoding,
 * where a codec (such as the `union()` codec) may try to decode the input using
 * several different codecs until one of them succeeds, but it only wants to
 * keep the mutations that were triggered while decoding the successful codec.
 */
export default class StateContainer {
  // Alias for convenience
  public static createKey = ImmutableStateContainer.createKey;

  public current: ImmutableStateContainer;

  public constructor(state: ImmutableStateContainer = ImmutableStateContainer.emptyState) {
    this.current = state;
  }

  public get<T>(key: IStateKey<T>): T {
    return this.current.get(key);
  }

  public set<T, ValueT extends T>(key: IStateKey<T>, value: ValueT): void {
    this.current = this.current.set(key, value);
  }

  public update<T, ValueT extends T>(key: IStateKey<T>, updater: (current: T) => ValueT): void {
    this.current = this.current.update(key, updater);
  }

  public reset<T>(key: IStateKey<T>): void {
    this.current = this.current.reset(key);
  }
}
