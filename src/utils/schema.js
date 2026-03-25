import { Record, List, Iterable, Map, Set, Collection } from 'immutable';
import Fields from './Fields';
import ViewModelClientError from '../utils/ViewModelClientError';

export const ENTITY = 'entity';
export const EXTERNAL_ASSOCIATION = 'external_association';

const ID_ATTRIBUTE = {
  type: 'string',
  // TODO: Should be true for certain types.
  notNull: false,
  collection: false,
  marshaller: undefined,
  from: Fields.ID,
  writeOnly: false,
};

const LOCK_VERSION_ATTRIBUTE = {
  type: 'number',
  notNull: false,
  collection: false,
  marshaller: undefined,
  from: Fields.LOCK_VERSION,
  writeOnly: false,
};

export const Attribute = Record({
  type: undefined,
  collection: false,
  notNull: false,
  marshaller: undefined,
  from: undefined,
  writeOnly: false,
});

export const Association = Record({
  type: undefined,
  collection: false,
  notNull: false,
  shared: false,
  from: undefined,
});

const PRIMITIVE_TYPES = Set([
  'string',
  'boolean',
  'number',
]);

const validateAttributeSchema = (data) => {
  const { type, marshaller } = data;
  const hasMarshaller = typeof marshaller !== 'undefined';

  if (typeof type === 'string') {
    if (!PRIMITIVE_TYPES.has(type)) {
      throw new ViewModelClientError(
        `When providing a string, the type must one of: ${PRIMITIVE_TYPES.toList().join(',')}.`);
    }
  } else if (typeof type === 'function') {
    if (!hasMarshaller) {
      throw new ViewModelClientError('Constructor type not provided with a valid marshaller.');
    } else {
      const { serialize, deserialize } = marshaller;

      if (typeof serialize !== 'function' || typeof deserialize !== 'function') {
        throw new ViewModelClientError(
          'Marshaller requires both a deserialize and serialize method.');
      }
    }
  } else {
    throw new ViewModelClientError(`${JSON.stringify(type)} is not valid value for type.`);
  }
};

const expandShorthand = (data) => {
  if (Array.isArray(data)) {
    if (data.length !== 1) {
      throw new ViewModelClientError(
        `Malformed collection attribute definition: '${JSON.stringify(data)}'.
         Collection shorthand requires a single element array.`);
    }

    return { type: data[0], collection: true };
  } else if (typeof data === 'string' || typeof data === 'function') {
    return { type: data, collection: false };
  } else {
    return data;
  }
};

// Transforms a schema into a regular structure of
// {
//   typeName: the given name,
//   version: the version number,
//   extends: reference to parent
//   storePrefix: a string
//   root: true | false,
//   attributes: {
//     [attr_name]: {
//       // should describe the deserialized typeof or instanceof returned from the server
//       type:       "string" | "number" | "boolean" | Function,
//       // For non primitive types, provide methods to deserialize and serialize.
//       marshaller: {
//         deserialize: (responseValue: any) => any,
//         serialize: (clientValue: any) => any,
//       },
//       collection: true | false,
//       notNull:    true | false,
//       // The property name that will be used for sending to the API.
//       from: string,
//     }
//   },
//   associations: {
//     [association_name]: {
//       type:       reference to another type,
//       collection: true | false,
//       notNull:    true | false,
//       shared:     true | false | 'maybe',
//       from: string,
//     }
//   },
//   attributeNameMap: {
//     [from]: attr_name | association_name,
//   },
// }

/**
 * Validates and normalizes structure of a user defined schema.
 *
 * @param {object}   schema
 * @param {object}   config
 * @param {function} config.namingStrategy
 * @param {Set}      config.types
 * @returns {object}
 */
export const parseSchema = (schema, { namingStrategy, types }) => {
  const {
    extends: Parent,
    persisted = false,
    lockable = false,
    root = false,
    typeName,
    version,
  } = schema;

  if (typeof typeName !== 'string') {
    throw new ViewModelClientError(
      `Expected typeName to be a string, for ${JSON.stringify(schema)}.`);
  }

  if (typeof version !== 'number') {
    throw new ViewModelClientError(
      `Expected version to be a number, for ${JSON.stringify(schema)}.`);
  }

  let storePrefix = schema.storePrefix || typeName;
  const attributes = {};
  const associations = {};
  const attributeNameMap = {};

  /**
   * @param {function} type         Attribute or Association constructor.
   * @param {string} key            Key for the field.
   * @param {object} definition     User defined schema definiton for attribute or association.
   * @returns                       Normalized definition.
   */
  const parseAttribute = (type, key, definition) => {
    const attribute = new type({
      from: namingStrategy(key),
      ...expandShorthand(definition),
    });

    const { from } = attribute;

    if (attribute instanceof Attribute) {
      attributes[key] = attribute;
    } else if (attribute instanceof Association) {
      associations[key] = attribute;
    }

    attributeNameMap[from] = key;

    return attribute;
  };

  // Only add the ID attribute for entities that can be persisted.
  if (persisted) {
    parseAttribute(Attribute, Fields.ID, ID_ATTRIBUTE);
  }

  if (typeof Parent !== 'undefined') {
    if (!types.has(Parent)) {
      throw new ViewModelClientError(`${typeName}.extends not in registry.`);
    }

    storePrefix = Parent.storePrefix;
    Object.assign(attributes, Parent.attributes);
    Object.assign(associations, Parent.associations);
    Object.assign(attributeNameMap, Parent.attributeNameMap);
    // Note that the `root` property is intentionally not shared between Parent
    // and child schemas, to support polymorphic entity types where some are
    // root entities and some are nested entities.
  }

  // If the entity can be locked, add the lock version field.
  if (lockable) {
    parseAttribute(Attribute, Fields.LOCK_VERSION, LOCK_VERSION_ATTRIBUTE);
  }

  if (schema.hasOwnProperty('attributes')) {
    for (const [key, attributeData] of Iterable(schema.attributes)) {
      const attribute = parseAttribute(Attribute, key, attributeData);

      try {
        validateAttributeSchema(attribute);
      } catch (e) {
        throw new ViewModelClientError(
          `Error with attribute for ${typeName}.${key}. ${e.message}`);
      }
    }
  }

  if (schema.hasOwnProperty('associations')) {
    for (const [key, associationData] of Iterable(schema.associations)) {
      const association = parseAttribute(Association, key, associationData);

      if (!types.has(association.type)) {
        throw new ViewModelClientError(
          `Error with association for ${typeName}.${key}. ` +
          'Type not in registry.');
      }
    }
  }

  return {
    kind: ENTITY,
    typeName,
    version,
    extends: Parent,
    storePrefix,
    persisted,
    lockable,
    root,
    attributes: Object.freeze(attributes),
    associations: Object.freeze(associations),
    attributeNameMap: Object.freeze(attributeNameMap),
  };
};

/**
 * @param {Object} schema  A normalized schema.
 * @returns {Function}
 */
export const recordFromSchema = (schema) => {
  const { typeName } = schema;

  const props = {
    [Fields.MIGRATED]: undefined,
  };
  const { attributes, associations } = schema;

  for (const [attribute, { collection }] of Iterable(attributes)) {
    props[attribute] = collection ? List() : undefined;
  }
  for (const [association, { collection }] of Iterable(associations)) {
    props[association] = collection ? List() : undefined;
  }

  // Make all props default to `undefined` so it is possible to set them to
  // undefined without setting them to the default value.
  const propsUndefined = Object.fromEntries(Object.keys(props).map((key) => [key, undefined]));
  const RecordConstructor = Record(propsUndefined, typeName);

  // eslint-disable-next-line @typescript-eslint/naming-convention
  function Constructor(instanceProps) {
    // Avoid unnecessarily re-creating immutable objects
    if (instanceProps instanceof Constructor) {
      return instanceProps;
    }
    // Support calling with and without `new`
    if (!(this instanceof Constructor)) {
      return new Constructor(instanceProps);
    }
    // Mimic the ImmutableJS v3 behavior of only using the default props when
    // constructing the record. This is necessary because in ImmutableJS v4
    // setting a value to `undefined` reverts it to the default value, but we
    // want to be able to use `undefined` to explictly mean that a value should
    // not be sent when serializing.
    //
    // This breaking change is already marked as a bug on the ImmutableJS
    // project, and we can remove this workaround if this issue is resolved:
    // https://github.com/immutable-js/immutable-js/issues/1889
    const definedProps = instanceProps ? Object.fromEntries(
      Collection.Keyed(instanceProps)
      .filter((value) => value !== undefined)
      .entries(),
    ) : undefined;
    RecordConstructor.call(this, { ...props, ...definedProps });
  }

  Constructor.prototype = Object.create(RecordConstructor.prototype);
  Constructor.prototype.constructor = Constructor;

  // Add the schema as static properties to the constructor.
  Object.assign(Constructor, schema);

  Constructor.makeNew = function makeNew() {
    return Map.of(Fields.NEW, true, Fields.TYPE, typeName);
  };

  Constructor.registerSubtype = function registerSubtype(subtype) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!this.subtypes) {
      this.subtypes = {};
    }

    this.subtypes[subtype.typeName] = subtype;
  };

  Constructor.makeReferenceForId = function makeReferenceForId(id) {
    // TODO: This should prevent us from making invalid references,
    // but the application presently relies on this behaviour.
    //
    // if (this.subtypes) {
    //   throw new ViewModelClientError('Cannot create reference to a polymorphic ' +
    //     `entity without instance: ${typeName}`);
    // }
    return baseMakeReference(typeName, id);
  };

  // Extend the prototype.
  Constructor.prototype.schema = Constructor; // TODO: why not constructor?

  Constructor.prototype.makeReference = function makeReference() {
    return baseMakeReference(typeName, this[Fields.ID]);
  };

  return Constructor;
};

const baseMakeReference = (typeName, id) => Map.of(Fields.ID, id, Fields.TYPE, typeName);

export const parseExternalAssociationSchema = (schema, types) => {
  const { typeName, associationType } = schema;
  const storePrefix = schema.storePrefix || typeName;

  if (typeof typeName !== 'string') {
    throw new ViewModelClientError(
      `Expected typeName to be a string, for ${JSON.stringify(schema)}.`);
  }

  if (!types.has(associationType)) {
    throw new ViewModelClientError(
      `Error with association for ${typeName}. ` +
      'Type not in registry.');
  }

  return {
    kind: EXTERNAL_ASSOCIATION,
    typeName,
    associationType,
    storePrefix,
  };
};
