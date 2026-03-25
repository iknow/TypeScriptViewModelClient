# `view-model/next`

This is the new view model client API, intended to eventually replace the current `view-model` API entirely. For now, the two APIs co-exist in the same package so it's possible to slowly transition to using the new API.

## Goals

The main goals for the new API are to:

1. Have types
2. Support unions of associations (which necessarily means supporting handle objects)
3. Make it easy to define custom attribute types (i.e. not always require manually writing serialize/deserialize functions)
4. Not always assume that entities will always be at the root of responses, because in practice they are not (e.g. the daily news categories endpoint returns entities grouped by string tags, and supplementary data may include entities inside it)
5. Support using entities in both a nested or normalized way.
6. Support runtime reflection (e.g. the ability to traverse a tree of codecs).
7. Not having a global entity type registry
    - The motivation is simply to avoid global state, but one side effect of this is that it is possible to create multiple schemas for the same entity type. This has disadvantages, like meaning it's theoretically possible for the schemas to conflict, but also has advantages, like making it possible to have both nested and normalized forms of the same entity type depending on the use case, or making some fields optional when creating an entity locally but required when decoding it.

## API

**Note:** Some of the types in this documentation were simplified to make the documentation easier to read. Refer to the code for accurate type definitions.

### Codec Reference

All exported codecs/codec creators and their corresponding classes and types. Assumes these imports:

```
import * as v from '@engoo/view-model/next';
import * as ioTs from 'io-ts';
import * as Immutable from 'immutable';
```

| Codec/Codec Creator | Codec Class | Encodable Type | Decoded Type |
| ------------------- | ----------- | -------------- | ------------ |
| `v.null` | `v.NullType` | `null` | `null` |
| `v.undefined` | `v.UndefinedType` | `undefined` | `undefined` |
| `v.void` | `v.VoidType` | `void` | `void` |
| `v.string` | `v.StringType` | `string` | `string` |
| `v.number` | `v.NumberType` | `number` | `number` |
| `v.boolean` | `v.BooleanType` | `boolean` | `boolean` |
| `v.unknown` | `v.UnknownType` | `unknown` | `unknown` |
| `v.UnknownArray` | `v.UnknownArrayType` | `unknown[]` | `unknown[]` |
| `v.UnknownDictionary` | `v.UnknownDictionaryType` | `{ [key: string]: unknown }` | `{ [key: string]: unknown }` |
| `v.literal<V>(value: V)` | `v.LiteralType` | `V` | `V` |
| `v.type<F>(fields: F)` | `v.InterfaceType` | `{ [K in keyof F]: v.TypeOf<F[K]> }` | `{ [K in keyof F]: v.DecodedTypeOf<F[K]> }` |
| `v.readonlyType<F>(fields: F)` | `v.ReadonlyInterfaceType` | `{ readonly [K in keyof F]: v.TypeOf<F[K]> }` | `{ readonly [K in keyof F]: v.DecodedTypeOf<F[K]> }` |
| `v.partial<F>(fields: F)` | `v.PartialType` | `{ [K in keyof F]?: v.TypeOf<F[K]> }` | `{ [K in keyof F]?: v.DecodedTypeOf<F[K]> }` |
| `v.array<C>(codec: C)` | `v.ArrayType` | `Array<v.TypeOf<C>>` | `Array<v.DecodedTypeOf<C>` |
| `v.readonlyArray<C>(codec: C)` | `v.ReadonlyArrayType` | `ReadonlyArray<v.TypeOf<C>>` | `ReadonlyArray<v.DecodedTypeOf<C>>` |
| `v.list<C>(codec: C)` | `v.ListType` | `Immutable.List<v.TypeOf<C>>` | `Immutable.List<v.DecodedTypeOf<C>>` |
| `v.associationList<C>(codec: C)` | `v.AssociationListType` | `Immutable.List<v.TypeOf<C>>` | `Immutable.List<v.DecodedTypeOf<C>>` |
| `v.dictionary<D, C>(domain: D, codomain: C)` | `v.DictionaryType` | `{ [K in v.TypeOf<D>]: v.TypeOf<C> }` | `{ [K in v.TypeOf<D>]: v.DecodedTypeOf<C> }` |
| `v.union<CS>(types: CS)` | `v.UnionType` | `v.TypeOf<CS[number]>` | `v.DecodedTypeOf<CS[number]>` |
| `v.intersection<CS>(types: CS)` | `v.IntersectionType` | `v.TypeOf<CS[0]> & ... & v.TypeOf<CS[4]>` | `v.DecodedTypeOf<CS[0]> & ... & v.DecodedTypeOf<CS[4]>` |
| `v.tuple<CS>(types: CS)` | `v.TupleType` | `[v.TypeOf<CS[0]>, ..., v.TypeOf<CS[4]>]` | `[v.DecodedTypeOf<CS[0]>, ..., v.DecodedTypeOf<CS[4]>]` |
| `v.keyof<D>(keys: D)` | `v.KeyOfType` | `keyof D` | `keyof D` |
| `v.lazy<C>(codec: C)` | `v.LazyType` | `v.Typeof<C>` | `v.DecodedTypeOf<C>` |
| `v.brand<C, N, B>(codec: C, predicate: (value: v.TypeOf<C>) => value is (v.TypeOf<C> & ioTs.Brand<B>), name: N)` | `v.BrandType` |`v.TypeOf<C> & ioTs.Brand<B>` | `v.DecodedTypeOf<C> & ioTs.Brand<B>` |
| `v.fromIoTs<C>(ioTsCodec: C)` | `v.ViewModelCodec` | `ioTs.TypeOf<C>` | `ioTs.TypeOf<C>` |
| `v.refinement<C>(codec: C, predicate: (value: v.TypeOf<C>) => boolean)` | `v.RefinementType` | `v.TypeOf<C>` | `v.DecodedTypeOf<C>` |
| `v.entity<F, TypeName>(args: { fields: F, typeName: TypeName })` | `v.EntityType` | `{ [K in keyof F]: v.TypeOf<F[K]> } & { _type: TypeName; _new?: boolean }` | `{ [K in keyof F]: v.DecodedTypeOf<F[K]> } & { _type: TypeName; _migrated?: boolean; }` |
| `v.nested<F>(entityConstructor: v.IEntityConstructor<F>)` | `v.NestedType` | `v.Entity<F>` | `v.DecodedEntity<F>` |
| `v.ref<F, TypeName>(entityCodec: v.EntityType<F, TypeName>)` | `v.RefType` | `{ id: v.TypeOf<F['id']>, _type: TypeName }` | `{ [K in keyof F]: v.DecodedTypeOf<F[K]> } & { _type: TypeName; _migrated?: boolean; }` |
| `v.encodedRef<F, TypeName>(entityCodec: v.EntityType<F, TypeName>)` | `v.EncodedRefType` | `{ [K in keyof F]: v.TypeOf<F[K]> } & { _type: TypeName; _new?: boolean }` | `{ [K in keyof F]: v.DecodedTypeOf<F[K]> } & { _type: TypeName; _migrated?: boolean; }` |
| `v.handle<F>(entityConstructor: v.IEntityConstructor<F>)` | `v.HandleType` | `v.Handle<v.IEntityConstructor<F>, v.TypeOf<F['id']>>` | `v.DecodedHandle<v.IEntityConstructor<F>>` |
| `v.refHandle<F>(entityConstructor: v.IEntityConstructor<F>)` | `v.RefHandleType` | `v.Handle<v.IEntityConstructor<F>, v.TypeOf<F['id']>>` | `v.DecodedHandle<v.IEntityConstructor<F>>` |
| `v.encodedRefHandle<F>(entityConstructor: v.IEntityConstructor<F>)` | `v.EncodedRefHandleType` | `v.Handle<v.IEntityConstructor<F>, v.TypeOf<F['id']>>` | `v.DecodedHandle<v.IEntityConstructor<F>>` |
| `v.assertedRefHandle<F>(entityConstructor: v.IEntityConstructor<F>)` | N/A | `v.DecodedHandle<v.IEntityConstructor<F>>` | `v.DecodedHandle<v.IEntityConstructor<F>>` |
| `v.lockVersion` | `v.LockVersionType` | `number` | `number \| undefined` |
| `v.opt<C>(codec: C)` | `v.OptType` | `v.TypeOf<C> \| undefined` | `v.DecodedTypeOf<C>` |
| `v.writeOnly<C>(codec: C)` | `v.WriteOnlyType` | `v.TypeOf<C> \| undefined` | `undefined` |
| `v.readOnly<C>(codec: C)` | `v.ReadOnlyType` | `v.DecodedTypeOf<C> \| undefined` | `v.DecodedTypeOf<C>` |
| `v.fromCodecs<E, D>(args: { encode: E, decode: D })` | `v.FromCodecsType` | `v.TypeOf<E>` | `v.DecodedTypeOf<D>` |
| `v.mapped<C, T, DT>(args: { codec: C, afterDecode: (value: v.DecodedTypeOf<C>) => DT, beforeEncode: (value: T) => v.TypeOf<C> })` | `v.MappedType` | `T` | `DT` |

### `ViewModelCodec`

The new `view-model/next` API is essentially a wrapper of `io-ts`'s API, but with extra features to support the needs of view models that `io-ts` alone doesn't support. Specifically, when decoding/encoding view models we need some state to be shared across different codecs to handle things like `references` and associations (i.e. "handles"), and we need the ability to not only encode a single value but to encode a diff from one value to another.

These things are built into the `ViewModelCodec` class, which is essentially a variation of `io-ts`'s `Type` class.

Here is `ViewModelCodec`'s interface:

```ts
interface ViewModelCodec<T, DecodedT extends T = T> {
  name: string;
  getChildCodecs: () => Array<ViewModelCodec<unknown>>;
  is: (value: unknown) => value is T;
  validateWithState: (
    input: unknown,
    context: IValidationContextEntry[],
    state: StateContainer,
  ) => Either<IValidationError[], DecodedT>;
  encodeWithState: (
    value: T,
    state: StateContainer,
  ) => unknown;
  encodeDiffWithState: (
    oldValue: T,
    newValue: T,
    state: StateContainer,
  ) => unknown;
}

interface IValidationError {
  value: unknown;
  context: IValidationContextEntry[];
  message?: string;
}
interface IValidationContextEntry {
  key: string;
  type: { name: string };
}

type TypeOf<C extends ViewModelCodec<any>> = C extends ViewModelCodec<infer T, any> ? T : never;
type DecodedTypeOf<C extends ViewModelCodec<any>> = C extends ViewModelCodec<any, infer T> ? T : never;
```

The `name` property and `is` method are exactly the same as the `io-ts` equivalent.

`validateWithState` and `encodeWithState` serve the same purpose as `io-ts`'s `validate` and `encode` methods, but are given a different name to make it more clear that they are not directly compatible. The only difference is that `validateWithState` and `encodeWithState` require a `state` argument. Each codec manually passes this object through when using other codecs, and the object is used to share response/request-specific state across codecs. For example, when decoding a response, the `references` data is put in the `state` so that any codec can access it if necessary. Another example is the `EntityDB`, which will be explained later.

`encodeDiffWithState` is similar to `encodeWithState`, but it should return a functional update that the backend understands to get from `oldValue` to `newValue`. In practice, most codecs use fallback logic which returns `undefined` if the values are the same, or returns `encodeWithState(newValue, state)` if the values are different. However, there are some important special cases, like the `entity()` codec which diffs each of its fields separately and returns an object containing only the fields that have changed, or the `associationList()` codec which uses the entity `id`s in a list of entities to create a minimal set of functional updates needed to transform the old list to the new one (the algorithm is copied directly from the current `view-model` library).

`getChildCodecs` should return an array of all child codecs if the codec is a higher order codec (e.g. `type()`/`array()`/`union()`/etc.), or an empty array if it is a primitive codec. This is mainly just to support `getEntityVersions()`, which needs to be able to traverse the entire tree of codecs to find all entity types and their versions.

Note that `ViewModelCodec` can have a different encodable type (`T`) and decoded type (`DecodedT`). A `DecodedT` will be returned by `validateWithState()`, but all other methods will use `T`. For most basic fields, `T` and `DecodedT` will be the same, but for some fields the type returned in API responses is slightly more narrow than the type allowed when sending API requests. For example, if an entity has an `id` field it should always be defined in API responses, but it does not necessarily have to be set in API requests (i.e. when creating a new entity). This can also be used to make the types more broad when editing data vs. when simply viewing data. For example, entities from an API response have been validated by the backend so we know all of the fields are set, but when editing or creating entities some of the fields may be unset until the user has finished filling in the form.

### `StateContainer`

A `StateContainer` instance is passed as an argument to `validateWithState`/`encodeWithState`/`encodeDiffWithState`, and gives codecs a place to put mutable state that can be shared across codecs/across instances of the same codec. Internally, this is used to support things like handling shared references and returning a normalized `EntityDB` from `decodeResponse`. However, it supports creating unique keys via `StateContainer.createKey`, so if necessary it can be used in externally defined custom codecs. In most cases this should not be needed, but this is its API if needed:

```ts
interface IStateKey<T> {
  readonly internalSymbol: symbol;
  readonly defaultValue: T;
}

/**
 * Essentially a `{ current: ImmutableStateContainer }` object, but with helpers for
 * updating the `.current` property, mainly to avoid having to add
 * `eslint-disable-next-line no-param-reassign` comments everywhere.
 */
class StateContainer {
  public static createKey<T>(defaultValue: T): IStateKey<T>;

  public current: ImmutableStateContainer;

  public constructor(state?: ImmutableStateContainer);

  public get<T>(key: IStateKey<T>): T;
  public set<T>(key: IStateKey<T>, value: T): void;
  public update<T>(key: IStateKey<T>, updater: (current: T) => T): void;
  public reset<T>(key: IStateKey<T>): void;
}

/**
 * Immutable data structure for containing arbitrary state with
 * externally-defined keys and default values.
 */
class ImmutableStateContainer {
  public static emptyState: ImmutableStateContainer;

  public get<T>(key: IStateKey<T>): T;
  public set<T>(key: IStateKey<T>, value: T): ImmutableStateContainer;
  public update<T>(key: IStateKey<T>, updater: (current: T) => T): ImmutableStateContainer;
  public reset<T>(key: IStateKey<T>): ImmutableStateContainer;
}
```

### Basic `io-ts` codecs

`ViewModelCodec` is the interface used to implement the codecs, but users of `view-model/next` won't use it directly unless they're defining a very special codec.

Instead, the API wraps all of `io-ts`'s basic codes (e.g. `array()`/`union()`/`number`/`string`/etc.) to implement `ViewModelCodec`'s interface instead of `io-ts`'s `Type`. They are used exactly the same way, though:

```ts
import * as v from 'view-model/next';

const myCodec = v.type({
  someString: v.string,
  someArray: v.array(
    v.union([v.number, v.null]),
  ),
});
```

There is also a `v.lazy()` codec to support recursive codecs, which works the same way as `io-ts`'s `recursive()` codec (which has been renamed to `lazy()` in the proposed next version of `io-ts`).

Aside: This is not the main reason that `view-model/next` wraps all of the `io-ts` codecs, but one advantage of this approach is that the next major version of `io-ts` may introduce major breaking changes that would remove the ability to do runtime reflection on codecs, which `view-model/next` needs (e.g. for `getEntityVersions()`). Because it wraps the codecs, these breaking changes will require changing some parts of `view-model/next` internally but not require changing its external API. The author of `io-ts` actually seems to recommend wrapping the API like this if you need to do runtime reflection with the upcoming `io-ts` API: https://github.com/gcanti/io-ts/issues/453#issuecomment-756262034.

Note that each codec function (e.g. `array()`) is just an alias for constructing an instance of the corresponding codec class (e.g. `ArrayType`). The codec class can be useful for runtime reflection (e.g. if you want to associate a particular class of codecs with some metadata or behavior).

### Main special codec: `entity()`

```ts
function entity<
  F extends IFields,
  T extends TypesForFields<F>,
  DecodedT extends T,
>(args: {
  typeName: string,
  version: number | undefined,
  noDiffFields?: Array<keyof F>, // Defaults to ['id', 'lockVersion']
  fields: F;
}): EntityType<F, T, DecodedT>;

interface IFields {
  [key: string]: ViewModelCodec<any>;
}

type TypesForFields<F extends IFields> = { [K in keyof F]: TypeOf<F[K]> };
type DecodedTypesForFields<F extends IFields> = { [K in keyof F]: DecodedTypeOf<F[K]> };

interface EntityType<
  F extends IFields,
  T extends TypesForFields<F>,
  DecodedT extends T,
> extends ViewModelCodec<T, DecodedT> {
  typeName: string;
  version: number;
  fields: F;
}
```

The `entity()` codec is similar to `type()`, but has some special behavior specific to view model requests:

- Its `encodeDiffWithState` actually diffs each of the fields separately, returning a subset containing only the fields that have actually changed.
- It adds the `_type` and `_new` fields when encoded.
- It automatically converts camelCase field names to snake_case when encoded.
- It validates that the `typeName`/`version` are correct when decoding, and exposes them on the decoded via `entity[v.ViewModelFields.Type]` and `entity[v.ViewModelFields.Version]`.
  - Note: `version` can be `undefined` in which case encoding the entity will throw an error. This is to support creating artifical entity types, that do not exist on the backend. So far there has not been a need for this, so it should generally be avoided.
- It exposes the `typeName`/`version`/etc. as properties on the codec for reflection purposes.
- It provides a `noDiffFields` option, which can be used to indicate fields which should not be diffed (meaning they will always be included in encoded diffs, regardless of whether or not the value changed). This defaults to `['id', 'lockVersion']`, and its main purpose is to avoid diffing these fields. You likely will not need to use it directly.

### Other special codecs: `list()`, `associationList()`, `fromCodecs()`, `mapped()`, `opt()`, `writeOnly()`, `readOnly()`

- `list()` is like `array()`, but it decodes to an ImmutableJS List instead of a plain array.
- `associationList()` is how the API supports diffing of lists of entities. It is like `list()`, but it only accepts a codec that decodes to an entity containing an `id` field, or to a `Handle`. If you want to be able to diff a field containing a list of entities or handles, use `associationList()` so that it generates a functional update with a minimal set of changes to the list when diffing the field. If you use `list()`/`array()` instead, it will diff the list as a whole, doing nothing if nothing has changed but replacing everything if even one item has changed.
- `fromCodecs({ decode, encode })` allows you to use two other codecs to easily define a codec that has different behavior when decoding vs. encoding. However, the `decode` codec must have a narrower type than the `encode` codec.
- `mapped({ codec, afterDecode, beforeEncode })` is similar to `fromCodecs`, but rather than using two separate codecs to determine the decode/encode types separately, you use `afterDecode` and `beforeEncode` functions to map the given codec's encode/decode types to other types.
- `opt()` takes a codec as input and treats the field as required when decoding but as optional when encoding. This is mainly for the `id` field, since you don't need to specify the `id` when creating a new entity. Equivalent to `v.fromCodecs({ decode: codec, encode: v.union([v.undefined, codec]) })`.
- `writeOnly()` takes an arbitrary codec as input and behaves normally when encoding, but will expect the value to always be `undefined` when decoding. Equivalent to `v.fromCodecs({ decode: v.undefined, encode: v.union([v.undefined, codec]) })`.
- `readOnly()` will decode the value normally, but will throw an error if you try to encode the value to anything other than `undefined`.

### Special string codecs:

`string` will encode strings as-is, but when working with user-generated strings, it may be useful to move some common pre-encode processing tasks closer to the encoding logic. `trimmed()` and `emptyAsNull()` are higher order codecs that accept any codec that encodes into strings (or string-derived types, such as branded strings), and perform a processing task on its _output_, while leaving decoding untouched:

- `trimmed()` trims an input string of any leading and trailing whitespace before encode.
- `emptyAsNull()` rewrites the empty string (`''`) into `null` before encode.

The place where these codecs insert their logic can be visualized as such:

```
Encode:
         +-------------+    +==============+
Input -> | Inner Codec | -> ‖ String Codec ‖ -> Output
         +-------------+    +==============+

Decode:
                   +-------------+
Decoded <--------  | Inner Codec | <----------- Server Data
                   +-------------+
```

The input and decoded data do not need to be strings; only the inner codec's output must be a string.

### `entityConstructor()`

```ts
function entityConstructor<F extends IFields, TypeName extends string>(args: {
  typeName: TypeName,
  version: number | undefined,
  noDiffFields?: Array<keyof F>,
  fields: F;
}): IEntityConstructor<F, TypeName>;

interface IEntityConstructor<F extends IFields, TypeName extends string> {
  new(fieldValues: v.TypesForFields<F>): Entity<F, TypeName>;
  // decodedEntity() is primarily for internal use
  decodedEntity(fieldValues: v.DecodedTypesForFields<F>): DecodedEntity<F, TypeName>;

  readonly fields: F;
  readonly typeName: TypeName;
  readonly version: number | undefined;
}
type Entity<T extends IAnyEntityConstructor> = Immutable.Record<v.TypesForFields<T['fields']>> & {
  _type: T['typeName'],
};
type DecodedEntity<T extends IAnyEntityConstructor> = Immutable.Record<v.DecodedTypesForFields<T['fields']F>> & {
  _type: T['typeName'],
};
```

`entityConstructor()` takes the same arguments as `entity()`, but instead of returning a codec it returns a class that can be used to create Immutable records representing the given entity type. To use it as a codec, wrap the constructor in `v.nested`.

This has several unrelated purposes:

1. Sort of backwards compatibility with the `view-model` library, since it currently uses Immutable records for entities. Updating the frontend to not use Immutable records would require a lot of work. Immutable data structures do make it easier/more performant to edit/diff the entities, so we might as well keep it.
2. Making it easier to use with runtime reflection, by exposing metadata such as `typeName` and `version`.

### `Handle`, `handle()`, and `EntityDB`

```ts
type IdForConstructor<T extends IAnyEntityConstructor> = (
  T extends IEntityConstructor<infer F, any> ? TypeOf<F['id']> : never
);

class Handle<T extends IAnyEntityConstructor, IdType = IdForConstructor<T>> {
  public readonly type: T;
  public readonly id: IdType;

  public constructor(type: T, id: IdType);

  public resolve(entityDb: DecodedEntityDB): DecodedEntity<T>;
}

/**
 * Codec that produces `Handle`s to the given entity type
 */
function handle<C extends IAnyEntityConstructor>(
  entityConstructor: C,
): ViewModelCodec<Handle<C>>;

/**
 * Immutable data structure for mapping handles to entities
 */
class EntityDB {
  public static emptyDb: EntityDB;

  public get<C extends IAnyEntityConstructor>(
    handle: Handle<C>,
  ): Entity<C> | undefined;
  public has<C extends IAnyEntityConstructor>(
    handle: Handle<C>,
  ): boolean;
  public set<C extends IAnyEntityConstructor>(
    handle: Handle<C>,
    value: Entity<C>,
  ): EntityDB;
  public merge(db: EntityDB): EntityDB;
}

/**
 * Same as `EntityDB`, but returns the stricter `DecodedEntity` types.
 *
 * `decodeResponse()` returns a `DecodedEntityDB` instead of `EntityDB`. Outside
 * code should probably not create/edit `DecodedEntityDB` instances directly.
 */
class DecodedEntityDB {
  public static emptyDb: DecodedEntityDB;

  public get<C extends IAnyEntityConstructor>(
    handle: Handle<C>,
  ): DecodedEntity<C> | undefined;
  public has<C extends IAnyEntityConstructor>(
    handle: Handle<C>,
  ): boolean;
  public set<C extends IAnyEntityConstructor>(
    handle: Handle<C>,
    value: DecodedEntity<C>,
  ): EntityDB;
  public merge(db: EntityDB): EntityDB;
}
```

`Handle`/`handle()`/`EntityDB` is how the API supports decoding entities to a normalized format instead of a nested format. When decoding, the `handle()` codec will put the parsed entity in the `state`'s `EntityDB`, which will ultimately be returned as `entityDb` from `decodeResponse()`.

### `DecodedHandle`

```ts
type DecodedIdForConstructor<T extends IAnyEntityConstructor> = (
  T extends IEntityConstructor<infer F, any> ? DecodedTypeOf<F['id']> : never
);

class DecodedHandle<
  T extends IAnyEntityConstructor,
  IdType = DecodedIdForConstructor<T>,
> extends Handle<T, IdType> {
  public constructor(type: T, entity: DecodedEntity<T>);
}
```

When a `handle()`/`refHandle()`/`encodedRefHandle()` codec is decoded, it will return a `DecodedHandle` instance. `DecodedHandle` is compatible with `Handle`, but with an important difference in behavior: it has an internal copy of the decoded entity at the time that `decodeResponse` was called, and it will return that entity as a fallback when using the `DecodedHandle` to look up entities in an `EntityDB` or `DecodedEntityDB`.

When working with data that only needs to be read and not updated, this is useful in several different ways:

1. You only need the handle itself to access the data, and don't need to worry about passing around an `DecodedEntityDB` alongside it, or risk getting an error if the wrong `DecodedEntityDB` was used.
2. When making multiple different API requests and calling `decodeResponse` separately, you don't need to merge together the `entityDb`s returned by each `decodeResponse` call.
3. Because `DecodedHandle` implements `Handle`'s interface, you can write code that expects there to be an `EntityDB` for holding local edits to the entity (e.g. a component inside an admin editor form) but re-use that same code for cases where you don't actually need the `EntityDB` (e.g. a read-only view of the same data as the admin editor form). Simply pass the code a `DecodedHandle` and an empty `EntityDB`, and the data from the `DecodedHandle` will always be used because the `EntityDB` is empty (assuming that the code does not internally create `new Handle(...)` objects directly).
4. When mocking nested entity data, such as for tests, it is easier to make nested `DecodedHandle`s instead of manually building a normalized `EntityDB`.

While the main use cases for `DecodedHandle` are for when you only need to read data, note that it can also be used to update data. For example when calling `encodeDiffRequest`, you could pass the original `DecodedHandle` to `fromValue` and a new `DecodedHandle` containing an updated copy of the entity to `toValue`. However, caution should be taken to not mix this approach with the standard approach of using `fromDb` and `toDb` to encode updates to nested entities. When diffing, the copy of the entity inside the `fromDb` and `toDb` will always be preferred, so if you make some updates via the `toValue` and some updates via the `toDb`, then updates made via the `toValue` could be silently ignored. As a general rule of thumb, encoding nested updates should be done via `fromDb`/`toDb`, and encoding updates via passing a different `DecodedHandle` to `fromValue`/`toValue` should only be done if the changes are shallow (e.g. only fields on the root entity are being updated).

### `ref()`/`refHandle()`/`encodedRefHandle()`/`assertedRefHandle()`

View-model entities marked as `root!` on the backend are encoded as references
in the request/response payload. This means that instead of being encoded as a
plain object with the entity's fields, it's encoded as a `{ _ref: '...' }`
object with a single `_ref` field containing an arbitrary string. This string
references an entry in the `references` field at the root of the payload, which
is where the actual entity data is encoded. For example:

```
{
  data: {
    some_entity: { _ref: 'r1' },
  },
  references: {
    r1: { _type: 'SomeEntity', id: '...', some_field: '...' },
  },
}
```

One reason is that it allows a single entity to be referenced by multiple other
entities in the payload without unnecessarily encoding the entity's data
multiple times.

The `ref()` codec encodes/decodes an entity in this way. `encodedRefHandle()`
does the same, but decodes to a `Handle` object.

`refHandle()` also decodes to a `Handle` object, but when encoding it does not
attempt to look up the entity that the `Handle` references in the `EntityDB`,
and only encodes the type/ID that the `Handle` references, without encoding any
fields. This makes it possible to reference an already existing entity that you
know the type/ID of, but don't have a local copy of. References are often used
to allow one entity to simply reference an associated entity, in which case it's
not necessary to encode changes to the referenced entity and `refHandle()` is
preferable over `encodedRefHandle()`.

`assertedRefHandle(EntityType, [OtherEntityType, OtherEntityType2, ...])` is just like `refHandle()`, but it allows you to specify a list of different entity types which will can also be used when encoding. However, regardless of the specific viewmodel type passed when encoding, the encoded request will always use the `_type` of the entity type passed as the first argument. This can help with the case where there are multiple viewmodels for the same backing database model, and you are combining data together from multiple sources. For example, when creating an entity it might expect to be passed a lightweight `UserProfile` to reference the user that created the entity, but in practice you might only have the full `User` entity. `assertedRefHandle(UserProfile, [User])` would allow you to pass the `User` entity you have, but encode it using `_type: 'UserProfile'` so it will be accepted by the backend.

### Codecs that wrap `entityConstructor`s

There are several different codec factories that can be used together with an `entityConstructor` class to decode/encode entities of that type in different ways: `nested`, `ref`, `encodedRef`, `handle`, `refHandle`, `encodedRefHandle`, and `assertedRefHandle`. See the `supports different ways of decoding entities` specs in `./api/decodeResponse.spec.ts` and the `supports different ways of encoding entities` specs in `./api/encodeRequest.spec.ts` for a reference of how each of these codecs behave differently when decoding and encoding.

Here are some questions to help decide which kind of codec should be used for an entity:

1. Is the entity encoded as a nested entity, or encoded inside the `references` section of the request/response?:
  - nested: use `handle` or `nested`
  - `references`: use `ref` or `refHandle` or `encodedRefHandle`
2. Do you want to get back a `Handle`/`DecodedHandle`, or do you want to get back a plain entity? The main reason for wanting a `Handle`/`DecodedHandle` is to be able to make local edits to nested entities (in practice on the frontend this is usually what we want).
  - `Handle`/`DecodedHandle`: use `handle` or `refHandle` or `encodedRefHandle`
  - plain entity: use `nested` or `ref`
3. If you are using something encoded in `references`, do you want to also encode updates to fields of that referenced entity? This is very rarely necessary.
  - If so, use `encodedRef` instead of `ref`, or `encodedRefHandle` instead of `refHandle`
4. If you are using something encoded in `references`, do you want to be able to encode using a different viewmodel type that has the same backing model?
  - If so, use `assertedRefHandle`. There is currently no `assertedRef`, but it could be added if the need arises.

### `decodeResponse()`/`encodeRequest()`/`encodeDiffRequest()`

```ts
function decodeResponse<T, M>(args: {
  response: unknown,
  codec: ViewModelCodec<T>,
  metaCodec: ViewModelCodec<M>,
  state?: ImmutableStateContainer,
}): {
  data: T,
  meta: M,
  entityDb: DecodedEntityDB,
  finalState: ImmutableStateContainer,
};

function encodeRequest<T>(args: {
  codec: ViewModelCodec<T>,
  value: T,
  encodeLockVersion?: boolean,
  encodeVersion?: boolean,
  state?: StateContainer,
}): {
  data: unknown,
  references: { [ref: string]: unknown },
  versions: { [typeName: string]: number | undefined },
};

function encodeDiffRequest<T>(args: {
  fromDb?: EntityDB,
  fromValue: T,
  toDb?: EntityDB,
  toValue: T,
  codec: ViewModelCodec<T>,
  encodeLockVersion?: boolean,
  state?: StateContainer,
}): {
  data: unknown,
  references: { [ref: string]: unknown },
  versions: { [typeName: string]: number | undefined },
};
```

Instead of calling `validateWithState`/`encodeWithState`/`encodeDiffWithState` on codecs directly, you should use these functions to decode/encode responses. They handle boilerplate like initializing the `state` object passed to codecs. In cases where you need to access the state externally when encoding a request, you can create a new `StateContainer`, pass it to `encodeRequest`/`encodeDiffRequest` using the `state` argument, and then check the state for mutations after encoding is finished.

Note: `decodeResponse` will throw if decoding the response fails, matching the current `view-model` behavior.

### `getEntityTypes()`/`getEntityVersions()`

```ts
function getEntityTypes(rootCodec: ViewModelCodec<unknown>): Array<EntityType<unknown>>;

function getEntityVersions(rootCodec: ViewModelCodec<unknown>): { [typeName: string]: number | undefined };
```

`getEntityTypes()` recursively traverses an arbitrary codec to find any entity codecs in it.

`getEntityVersions()` uses `getEntityTypes()` to return a mapping of type names to versions (like the existing `calculateVersions()` helper). This should be passed as a query param in API requests to support backend view-level migrations.

### External Associations

There is no first-class abstraction for external associations, but from the client's perspective they are essentially just endpoints which return a list of entities. This can easily be expressed using the existing codecs:

```ts
const AssociatedEntity = v.entityConstructor({
  typeName: 'AssociatedEntity',
  ...
});

const entityId = 'some-guid';
const response = await fetchFromApi(`/some/external/association/for/${entityId}`);
const { data, entityDb } = v.decodeResponse({
  codec: v.associationList(v.handle(AssociatedEntity)),
  response,
});
```

Because this list does not belong to a particular entity, it cannot be stored in an `EntityDB`. Instead, you must keep a copy of the list before making edits in order to generate a diff. For example:

```ts
const response = await fetchFromApi(`/some/external/association/for/${entityId}`);
const { data: originalList, entityDb } = v.decodeResponse({
  codec: v.associationList(v.handle(AssociatedEntity)),
  response,
});

let updatedList = originalList;

// Make edits to the list. In practice this would be done by the user via some UI,
// and `updatedList`/`originalList` would probably be stored as React state.
updatedList = originalList.push(...);

...

// Later, send a diff of changes to the server.
const request = v.encodeDiffRequest({
  codec: v.associationList(v.handle(AssociatedEntity)),
  fromValue: originalList,
  toValue: updatedList,
  // We are not editing the entities themselves, only their presence/position in the list,
  // so we set `fromDb` and `toDb` to the same value.
  fromDb: entityDb,
  toDb: entityDb,
});
await postToApi(`/some/external/association/for/${entityId}`, request);
```

Note that because this only generates a minimal diff of the entities that were added/removed/re-ordered, this means it's possible to fetch only a subset of the list (possibly only items matching certain criteria), and editing that subset will still generally work properly. For example, if the external association contains items A through Z, you could:

- Fetch the list with filters to only get the first 5 vowels, returning `A, E, I, O, U`
- Remove items and re-order the list, resulting in `O, I, E`
- Do a diff from `A, E, I, O, U` to `O, I, E`, resulting in a request that says to remove `A` and `U` and move `O` to be before `I`
- Send this diff to the server

This would not replace the entire list with only `O, I, E`, but instead would only apply the diff, resulting in the external association containing all letters except for `A` and `U`, and with `O` just before `I`.

## API example usage

### Decode to nested, non-immutable entities (for simple uses cases like realtime)

```ts
import * as v from 'view-model/next';

const ChildCodec = v.entity({
  typeName: 'Child',
  version: 1,
  fields: {
    someValue: v.number,
  },
});

const ExampleCodec = v.entity({
  typeName: 'Example',
  version: 1,
  fields: {
    // `v.opt()` is a helper codec to make it so `id` is required when
    // decoding but optional when encoding.
    id: v.opt(v.string),
    children: v.array(ChildCodec),
  },
});

// Decoding
const response = await fetchFromApi('/some/endpoint');
// Note: Currently, `decodeResponse()` will throw if the data doesn't match the codec.
// Maybe it should return an `Either` instead of throwing?
const { data } = v.decodeResponse({
  codec: ExampleCodec,
  response,
});
for (const childEntity of data.children) {
  console.log(childEntity.someValue);
}

// Encoding
const request = v.encodeRequest({
  codec: ExampleCodec,
  value: {
    id: undefined,
    children: [
      { someValue: 1 },
      { someValue: 2 },
    ],
  },
});
await postToApi('/some/endpoint', request);
```

### Using `EntityDB`/handles and immutable entity constructors

```ts
import * as v from 'view-model/next';
import { List } from 'immutable';

class Child extends v.entityConstructor({
  typeName: 'Child',
  version: 1,
  fields: {
    // `Child` needs an `id` to be used with `handle()`
    id: v.opt(v.string),
    someValue: v.number,
  },
}) {}

class Example extends v.entityConstructor({
  typeName: 'Example',
  version: 1,
  fields: {
    id: v.opt(v.string),
    // Use a `handle()` codec so the `Child` entity instances are stored in the
    // `EntityDB`, and replaced with a `Handle` object.
    //
    // `associationList()` is like `array()`, but supports diffing of associated entities
    children: v.associationList(v.handle(Child)),
  },
}) {}

// Decoding
const response = await fetchFromApi('/some/endpoint');
const { data, entityDb } = v.decodeResponse({
  codec: v.nested(Example),
  response,
});
for (const childHandle of data.children) {
  console.log(entityDb.get(childHandle).someValue);
}

const child1Handle = new v.Handle(Child, new Child({ id: 'child-1', someValue: 1 }));
const child2Handle = new v.Handle(Child, new Child({ id: 'child-2', someValue: 2 }));

// Encoding
//
// Note: When the codec is created through `entityConstructor()`, the `value`
// must be an instance of the immutable entity object (unlike `entity()` which
// returns/accepts plain objects).
const request = v.encodeRequest({
  codec: v.nested(Example),
  value: new Example({
    id: undefined,
    // Because we're using `associationList()`/`handle()` is an immutable list
    // of handles, not the child entities themselves.
    children: List([
      child1Handle,
      chidl2Handle,
    ]),
  }),
});
await postToApi('/some/endpoint', request);

// Diffing
const value = new Example({
  id: 'example-1',
  children: List([
    child1Handle,
    child2Handle,
  ]),
});
// Will produce a functional update request updating `child-2`'s value to `3`.
const request = v.encodeDiffRequest({
  codec: v.nested(Example),
  fromValue: value,
  toValue: value,
  // The value itself has not changed, but the `EntityDB` is different so it will still produce a diff.
  fromDb: entityDb,
  toDb: entityDb.set(chidl2Handle, new Child({ id: 'child-2', someValue: 3 })),
});
await postToApi('/some/endpoint', request);
```

### Decoding non-standard responses

```ts
import * as v from 'view-model/next';

const response = await fetchFromApi('/some/endpoint');
const { data, meta } = v.decodeResponse({
  // Instead of returning a single entity, this endpoint returns an array of entities.
  //
  // Using `v.list()` instead of `v.array()` to parse the array to an ImmutableJS List instead of a plain array.
  codec: v.list(v.nested(SomeEntity)),
  // Supplementary data can also be parsed using arbitrary codecs
  metaCodec: v.type({
    supplementary: v.type({
      // Entity codecs can be used arbitrarily inside other codecs, not only at the top level.
      otherEntity: v.nested(SomeOtherEntity),
    }),
  }),
  response,
});
for (const entity of data) {
  console.log(entity.someValue);
}
console.log(meta.supplementary.someOtherValue);
```
