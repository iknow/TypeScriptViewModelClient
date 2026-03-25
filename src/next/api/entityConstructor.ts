import * as Immutable from 'immutable';
import * as v from '../codecs/ioTs';
import { IEntityTypeArgs } from '../codecs/EntityType';
import {
  IEntityConstructor,
  IAnyEntityConstructor,
  DecodedEntity,
  IEntityMetaEncodable,
  IEntityMetaDecoded,
} from '../shared/Entity';
import fromEntries from '../shared/fromEntries';
import ViewModelFields from '../shared/ViewModelFields';

/**
 * Returns a class representing an immutable object with the given fields. To
 * use as a codec, wrap the constructor in `v.nested` or `v.handle`.
 *
 * The main purpose of this is to produce an immutable object that can be put
 * inside an `EntityDB`. If you don't need to use `EntityDB` and don't need
 * immutable objects, you may want to use `v.entity(...)` directly to just
 * produce the `ViewModelCodec` without also creating an entity object
 * constructor.
 */
export default function entityConstructor<
  F extends v.IFields,
  TypeName extends string
>(
  args: IEntityTypeArgs<F, TypeName>,
): IEntityConstructor<F, TypeName> {
  /**
   * An `Immutable.Record` that can be added to/retrieved from the `EntityDB`.
   */
  class ImmutableEntityConstructor extends Immutable.Record(
    fromEntries((
      [
        // Include meta fields in decoded entities
        ViewModelFields.Type,
        ViewModelFields.Migrated,
        ViewModelFields.New,
        ...Object.keys(args.fields),
      ]
      .map((key) => [key, undefined])
    )),
    args.typeName,
  ) {
    public static readonly fields = args.fields;
    public static readonly typeName = args.typeName;
    public static readonly version = args.version;
    public static readonly noDiffFields = args.noDiffFields;
    public static readonly [isEntityConstructorSymbol] = true;

    public constructor(fieldValues: v.TypesForFields<F> & IEntityMetaEncodable) {
      super({
        [ViewModelFields.Type]: args.typeName,
        ...fieldValues,
      });
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    public static decodedEntity(
      fieldValues: v.DecodedTypesForFields<F> & IEntityMetaDecoded,
    ): DecodedEntity<IEntityConstructor<any, TypeName>> {
      return new this({
        [ViewModelFields.Type]: args.typeName,
        ...fieldValues,
      }) as unknown as DecodedEntity<IEntityConstructor<any, TypeName>>;
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  return ImmutableEntityConstructor as unknown as IEntityConstructor<F, TypeName>;
}

/**
 * A module-private symbol that should only be applied to classes returned by
 * {@link entityConstructor}. Used to implement {@link isEntityConstructor}.
 */
const isEntityConstructorSymbol = Symbol('isEntityConstructorSymbol');

/**
 * Returns true if the given class was created by {@link entityConstructor}.
 */
export function isEntityConstructor(value: unknown): value is IAnyEntityConstructor {
  return typeof value === 'function' && isEntityConstructorSymbol in value;
}
