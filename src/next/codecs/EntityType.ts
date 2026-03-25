import * as Immutable from 'immutable';
import ViewModelCodec from '../api/ViewModelCodec';
import ViewModelFields from '../shared/ViewModelFields';
import camelCaseToSnakeCase from '../shared/camelCaseToSnakeCase';
import StateContainer from '../api/StateContainer';
import { IEntityMetaEncodable, IEntityMetaDecoded, IEntityMetaType } from '../shared/Entity';
import TypeIdRecord from '../shared/TypeIdRecord';
import KeyMappingInterfaceType from './KeyMappingInterfaceType';
import * as v from './ioTs';

type BasicEntityDB = Immutable.Map<TypeIdRecord, unknown>;

export const allEntitiesDbKey = StateContainer.createKey<BasicEntityDB | undefined>(undefined);
export const oldEntitiesDbKey = StateContainer.createKey<BasicEntityDB | undefined>(undefined);
export const encodeVersionKey = StateContainer.createKey(false);
/**
 * This container value can be referenced to check if a codec is being encoded in the context of a new entity.
 * This is useful for codecs like {@see writeOnce} where the value should only be encoded when the entity is being
 * created.
 **/
export const newEntityContextKey = StateContainer.createKey(false);

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type EntityOutput = {
  [ViewModelFields.Id]?: unknown;
  [ViewModelFields.Type]: string;
  [ViewModelFields.New]?: boolean;
};

export interface IEntityTypeArgs<F extends v.IFields, TypeName extends string> {
  typeName: TypeName;
  version: number | undefined;
  noDiffFields?: Array<keyof F>;
  fields: F;
}

/**
 * `EntityType` is abstract so it can be extended with an overridden `T` and
 * `DecodedT`. This way both `PlainObjectEntityType` and `NestedType` can
 * subclasses of `EntityType`, for use with runtime reflection. In practice,
 * `EntityType` codecs are constructed with `entity()` (for a codec that decodes
 * to plain objects) or `nested(entityConstructor(...))` (for a codec that
 * decodes to ImmutableJS objects).
 */
export default abstract class EntityType<
  F extends v.IFields,
  T extends v.TypesForFields<F> & IEntityMetaEncodable & IEntityMetaType<TypeName>,
  DecodedT extends T,
  TypeName extends string,
> extends v.InterfaceType<
  F,
  T,
  EntityOutput,
  DecodedT
> {
  public readonly typeName: TypeName;
  public readonly version: number | undefined;
  public readonly fields: F;
  public readonly noDiffFields: Array<keyof F>;
  public readonly encodedKeysToKeys: Record<string, keyof F>;

  public constructor({
    typeName,
    version,
    noDiffFields = ['id', 'lockVersion'],
    fields,
  }: IEntityTypeArgs<F, TypeName>) {
    const noDiffFieldsSet = new Set(noDiffFields);

    const idField = fields[ViewModelFields.Id] as ViewModelCodec<unknown> | undefined;

    const interfaceType = new KeyMappingInterfaceType(fields, camelCaseToSnakeCase);
    const typeFieldType = v.type({ [ViewModelFields.Type]: v.literal(typeName) });
    const newFieldType = v.partial({ [ViewModelFields.New]: v.boolean });
    const encodingType = v.intersection([typeFieldType, newFieldType, interfaceType]);
    const decodingMetadataType = v.type({
      [ViewModelFields.Version]: version === undefined ? v.undefined : v.literal(version),
      [ViewModelFields.Migrated]: v.union([v.undefined, v.boolean]),
    });
    const decodingType = (
      v.intersection([typeFieldType, decodingMetadataType, interfaceType])
    ) as ViewModelCodec<unknown, unknown, DecodedT>;

    const stripUndefined = (o: Record<string, unknown>): void => {
      // Don't include undefined attributes in output (mainly to match legacy
      // view-model library behavior, but also to make it easier to write tests
      // by allowing any undefined attributes to be omitted from the expected
      // value).
      for (const [name, value] of Object.entries(o)) {
        if (value === undefined) {
          // eslint-disable-next-line no-param-reassign
          delete o[name];
        }
      }
    };

    super({
      name: typeName,
      is: (value): value is T => encodingType.is(value),
      getChildCodecs: () => Object.values(fields),

      validateWithState: decodingType.validateWithState,

      encodeWithState: (value, state) => {
        const allEntitiesDb = state.get(allEntitiesDbKey);
        const initialIsNewState = state.get(newEntityContextKey);
        const isCollectingEntities = allEntitiesDb !== undefined;

        // When collecting entities, allow traversing version-less entities,
        // because the encoded result will not actually be used.
        if (version === undefined && !isCollectingEntities) {
          throw new Error(`Cannot encode entity type '${typeName}' with undefined version`);
        }

        const id = idField?.encodeWithState(value[ViewModelFields.Id], state);

        // `allEntitiesDb` should only be set during the first pass of
        // `encodeDiffRequest`, when it calls `encodeWithState` to collect all
        // old entities, which will then be stored in `oldEntitiesDb` during
        // the second pass.
        if (allEntitiesDb !== undefined && id !== undefined) {
          const key = new TypeIdRecord({
            type: typeName,
            id,
          });
          if (allEntitiesDb.has(key)) {
            // When we are collecting entities for `encodeDiffRequest`, it's
            // possible for the same entity to appear in both the `fromDb` and
            // the `fromValue`. To avoid unnecessary work, don't bother
            // traversing the same entity twice. Because the return value is
            // not actually used while collecting entities, we can simply
            // return a dummy value.
            return { [ViewModelFields.Type]: '' };
          }
          state.update(allEntitiesDbKey, (db) => db?.set(key, value));
        }

        // `oldEntitiesDb` should only be set when calling `encodeDiffRequest`
        const oldEntitiesDb = state.get(oldEntitiesDbKey);
        // If the ID is undefined, then we cannot update an existing entity, so
        // all we can do is create a new entity.
        let isNew = id === undefined;
        // Even if the ID is set, it's still possible that we're creating a new
        // entity with a client-generated ID. To determine this we look at the
        // existing entities (which ultimately come from the `fromValue` and
        // `fromDb`` passed to `encodeDiffWithState`) and look if an entity with
        // the given ID already exists. If none exists, then we assume that we
        // must be creating a new entity with a client-generated ID.
        if (oldEntitiesDb !== undefined && id !== undefined) {
          // Because some `encodeDiffWithState()` handlers call
          // `encodeWithState()` (such as `union()` calling it when the value is
          // a different type from the previous value), we need to handle the
          // possibility of diffing even in `encodeWithState()`.
          const oldEntity = oldEntitiesDb.get(new TypeIdRecord({
            type: typeName,
            id,
          })) as T | undefined;
          if (oldEntity === undefined) {
            isNew = true;
          } else {
            if (id !== oldEntity[ViewModelFields.Id]) {
              // This should never happen in practice, because we use
              // `value`'s `id` to look up `oldEntity`.
              throw new Error('Internal error: Bad data in oldEntitiesDb');
            }
            const diff = this.encodeDiffWithState(oldEntity, value, state);
            return diff === undefined ? {
              [ViewModelFields.Type]: typeName,
              [ViewModelFields.Id]: id,
            } : diff;
          }
        }

        state.set(newEntityContextKey, isNew);
        const data: EntityOutput & Record<string, unknown> = encodingType.encodeWithState(
          value as T & { [ViewModelFields.Type]: TypeName; },
          state,
        );
        state.set(newEntityContextKey, initialIsNewState);

        if (state.get(encodeVersionKey)) {
          data[ViewModelFields.Version] = version;
        }

        // If the ID is undefined, we don't need to explicitly set the _new
        // field because the backend implicitly creates a new entity with a
        // backend-generated ID.
        if (isNew && data[ViewModelFields.New] === undefined && id !== undefined) {
          data[ViewModelFields.New] = true;
        }
        stripUndefined(data);

        return data;
      },

      encodeDiffWithState: (oldValue, newValue, state) => {
        if (version === undefined) {
          throw new Error(`Cannot encode entity type '${typeName}' with undefined version`);
        }

        if (oldValue[ViewModelFields.Id] !== newValue[ViewModelFields.Id]) {
          // When ID has changed, this is an entirely new entity and we
          // should not be diffing it.
          return this.encodeWithState(newValue, state);
        }

        const diff: EntityOutput & Record<string, unknown> = {
          [ViewModelFields.Type]: typeName,
        };
        let hasDiffs = false;

        for (const [fieldName, fieldCodec] of Object.entries(fields)) {
          const oldFieldValue = oldValue[fieldName];
          const newFieldValue = newValue[fieldName];

          if (noDiffFieldsSet.has(fieldName)) {
            diff[camelCaseToSnakeCase(fieldName)] = fieldCodec.encodeWithState(
              newFieldValue,
              state,
            );
            continue;
          }

          const result = fieldCodec.encodeDiffWithState(
            oldFieldValue,
            newFieldValue,
            state,
          );
          // If the field's encodeDiff() returns undefined, it means that it
          // should not be included in the diff (i.e. that value has not changed).
          if (result !== undefined) {
            diff[camelCaseToSnakeCase(fieldName)] = result;
            hasDiffs = true;
          }
        }

        if (!hasDiffs) {
          return undefined;
        }

        stripUndefined(diff);

        return diff;
      },
    });

    this.typeName = typeName;
    this.version = version;
    this.fields = fields;
    this.encodedKeysToKeys = interfaceType.encodedKeysToKeys;
    this.noDiffFields = noDiffFields;
  }
}

export class PlainObjectEntityType<
  F extends v.IFields,
  TypeName extends string,
> extends EntityType<
  F,
  v.TypesForFields<F> & IEntityMetaEncodable & IEntityMetaType<TypeName>,
  v.DecodedTypesForFields<F> & IEntityMetaDecoded & IEntityMetaType<TypeName>,
  TypeName
> {}

export const entity = v.constructorAsFunc(PlainObjectEntityType);
