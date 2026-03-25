// The nature of the code here relies on using `any`
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Immutable from 'immutable';
import * as v from '../codecs/ioTs';
import ViewModelFields from './ViewModelFields';

/**
 * In practice, {@link IEntityConstructor} types must be assignable to {@link
 * IAnyEntityConstructor}, but we cannot enforce this using `extends
 * IAnyEntityConstructor` because that would lead to {@link IEntityConstructor}
 * having overloaded constructor types. {@link IAnyEntityConstructorBase} is
 * used to ensure that everything besides the constructors are type compatible.
 */
interface IAnyEntityConstructorBase {
  readonly fields: v.IFields;
  readonly noDiffFields: PropertyKey[] | undefined;
  readonly typeName: string;
  readonly version: number | undefined;
}

/**
 * A class that can be used to construct entity objects. Returned from
 * `entityConstructor()`.
 */
export interface IEntityConstructor<
  F extends v.IFields,
  TypeName extends string,
> extends IAnyEntityConstructorBase {
  readonly fields: F;
  readonly noDiffFields: Array<keyof F> | undefined;
  readonly typeName: TypeName;

  /**
   * Constructor for creating local `Entity` instances.
   */
  new(fieldValues: v.TypesForFields<F> & IEntityMetaEncodable): Entity<this>;
  /**
   * Static method that can be used to construct a `DecodedEntity` instance.
   * This is mainly for tests, because in practice only `decodeResponse()`
   * should produce decoded entities.
   */
  decodedEntity: (fieldValues: v.DecodedTypesForFields<F> & IEntityMetaDecoded) => DecodedEntity<this>;
}

/**
 * Base type for {@link IEntityConstructor}, which can be used as a type
 * constraint when a function/class needs to take an arbitrary entity
 * constructor as a type argument.
 */
export interface IAnyEntityConstructor extends IAnyEntityConstructorBase {
  // These must have the same return types as the constructors in
  // `IEntityConstructor`, to ensure that `IEntityConstructor` types are
  // assignable to `IAnyEntityConstructor`.
  new(fieldValues: any): Entity<this>;
  decodedEntity: (fieldValues: any) => DecodedEntity<this>;
}

/**
 * Base type that extends {@link IAnyEntityConstructor} to require that the
 * entity has an `id` field.
 */
export interface IAnyEntityConstructorWithId<IdType = unknown> extends IAnyEntityConstructor {
  new(args: any): Entity<this> & { [ViewModelFields.Id]: IdType; };
  decodedEntity: (args: any) => DecodedEntity<this> & { [ViewModelFields.Id]: IdType; };
}


/**
 * The same as `Entity`, but without the Immutable.Record methods. This can be
 * useful as an argument type for functions that don't need to use the Immutable
 * methods, to avoid creating unnecessarily strict type constraints.
 */
export type ReadonlyEntity<T extends IAnyEntityConstructor> = (
  Readonly<(IAnyEntityConstructor | IAnyEntityConstructorWithId) extends T ? Record<PropertyKey, any> : v.TypesForFields<T['fields']>> &
  IEntityMetaType<T['typeName']> &
  IEntityMetaEncodable
);
export type AnyReadonlyEntity = ReadonlyEntity<IAnyEntityConstructor>;

/**
 * The local representation of entities. This is just an `Immutable.Record` of
 * the entity's fields, plus some metadata fields.
 */
export type Entity<T extends IAnyEntityConstructor> = (
  Immutable.Record<(IAnyEntityConstructor | IAnyEntityConstructorWithId) extends T ? any : v.TypesForFields<T['fields']>> &
  ReadonlyEntity<T>
);
export type AnyEntity = Entity<IAnyEntityConstructor>;

/**
 * The same as `DecodedEntity`, but without the Immutable.Record methods. This can be
 * useful as an argument type for functions that don't need to use the Immutable
 * methods, to avoid creating unnecessarily strict type constraints.
 */
export type ReadonlyDecodedEntity<T extends IAnyEntityConstructor> = (
  Readonly<(IAnyEntityConstructor | IAnyEntityConstructorWithId) extends T ? Record<PropertyKey, any> : v.DecodedTypesForFields<T['fields']>> &
  IEntityMetaType<T['typeName']> &
  IEntityMetaDecoded &
  IDecodedEntityBrand
);
export type AnyReadonlyDecodedEntity = ReadonlyDecodedEntity<IAnyEntityConstructor>;

/**
 * The decoded representation of entities. This is just an `Immutable.Record` of
 * the entity's decoded fields, plus some metadata fields.
 */
export type DecodedEntity<T extends IAnyEntityConstructor> = (
  Immutable.Record<(IAnyEntityConstructor | IAnyEntityConstructorWithId) extends T ? any : v.DecodedTypesForFields<T['fields']>> &
  ReadonlyDecodedEntity<T>
);
export type AnyDecodedEntity = DecodedEntity<IAnyEntityConstructor>;

export interface IEntityMetaEncodable {
  [ViewModelFields.New]?: boolean;
}

export interface IEntityMetaDecoded {
  readonly [ViewModelFields.Migrated]?: boolean;
}

const decodedEntityBrand = Symbol('decodedEntityBrand');
interface IDecodedEntityBrand {
  /**
   * Unique symbol used to make decoded entities into a branded type, to ensure
   * someone can't pass a non-decoded entity to an API which expects a decoded
   * entity.
   */
  readonly [decodedEntityBrand]: unknown;
}

export interface IEntityMetaType<TypeName extends string> {
  readonly [ViewModelFields.Type]: TypeName;
}
