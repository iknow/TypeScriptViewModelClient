import { Iterable, List } from 'immutable';
import Fields from '../utils/Fields';
import { Attribute } from '../utils/schema';
import ViewModelClientError from '../utils/ViewModelClientError';

export class ValidationError extends ViewModelClientError {
  name = 'ValidationError';

  constructor(message, typeName, field, id) {
    let prependedMessage = '';

    if (typeName) {
      const idFragment = id ? `(${id})` : '';
      const fieldFragment = field ? `[${field}]` : '';
      prependedMessage = `Error on ${typeName}${idFragment}${fieldFragment}. `;
    }

    super(`${prependedMessage}${message}`);

    this.typeName = typeName;
    this.field = field;
    this.id = id;
  }
}

export class SharedReferenceError extends ValidationError {
  name = 'SharedReferenceError';

  constructor(reference, type, field, id) {
    super(`Cannot find ${JSON.stringify(reference)} in references.`, type, field, id);
  }
}

export class NotNullError extends ValidationError {
  name = 'NotNullError';

  constructor(type, field, id) {
    super('Expected a non null value.', type, field, id);
  }
}

export class CollectionError extends ValidationError {
  name = 'CollectionError';

  constructor(type, field, id) {
    super('Type conflicts with collection flag.', type, field, id);
  }
}

export class AssignmentError extends ValidationError {
  name = 'AssignmentError';

  constructor(expectedTypeName, received, type, field, id) {
    const receivedValueName = (
      (typeof received === 'object' && typeof received?.constructor?.name === 'string') ?
        received.constructor.name :
        typeof received
    );
    super(`Expected ${expectedTypeName}, but got ${receivedValueName}.`, type, field, id);
  }
}

export class AttributeAssignmentError extends AssignmentError {
  name = 'AttributeAssignmentError';

  constructor(attribute, received, type, field, id) {
    const attributeTypeName = (
      // Primitive type
      typeof attribute.type === 'string' ? attribute.type :
      // Class type
      typeof attribute.type?.name === 'string' ? attribute.type.name :
      // Fallback which should not happen in practice
      String(attribute.type)
    );
    super(attributeTypeName, received, type, field, id);
  }
}

export class AssociationAssignmentError extends AssignmentError {
  name = 'AssociationAssignmentError';

  constructor(association, received, type, field, id) {
    super(association.type.typeName, received, type, field, id);
  }
}

export class FieldMissingError extends ValidationError {
  name = 'FieldMissingError';

  constructor(type, field, id) {
    super('Expected field is missing.', type, field, id);
  }
}

export class UnexpectedWriteOnlyFieldError extends ValidationError {
  name = 'UnexpectedWriteOnlyFieldError';

  constructor(type, field, id) {
    super('Received a write only field.', type, field, id);
  }
}

export class UnexpectedFieldError extends ValidationError {
  name = 'UnexpectedFieldError';

  constructor(type, field, id) {
    super('Received unexpected field.', type, field, id);
  }
}

export class NormalizeNonPersistedError extends ValidationError {
  name = 'NormalizeNonPersistedError';

  constructor(type) {
    super('Cannot normalize a non persisted type.', type);
  }
}

/**
 * @param {*} value
 * @returns {boolean}
 */
const isNullish = (value) => value === null || value === undefined;

/**
 * @param {object} schema
 * @param {boolean} schema.notNull
 * @param {*} value
 * @returns {boolean}
 */
const isValidNotNull = (schema, value) => !schema.notNull || value !== null;

/**
 * @param {object} schema
 * @param {boolean} schema.collection
 * @param {boolean} schema.notNull
 * @param {*} value
 * @returns {boolean}
 */
const isValidCollection = (schema, value) => {
  const { collection, notNull } = schema;
  const isArray = Array.isArray(value);

  if (!notNull && isNullish(value)) {
    return true;
  } else {
    return (collection && isArray) || (!collection && !isArray);
  }
};

/**
 * @param {object} schema
 * @param {boolean} schema.notNull
 * @param {string|function} schema.type
 * @param {*} value
 * @returns {boolean}
 */
const isValidType = (schema, value) => {
  const { type } = schema;

  return typeof type === 'function' ?
    isValidInstanceType(schema, value) :
    isValidPrimitiveType(schema, value);
};

/**
 * @param {object} schema
 * @param {string|function} schema.type
 * @param {*} value
 * @returns {boolean}
 */
const isValidPrimitiveType = (schema, value) => {
  const { type } = schema;
  return typeof value === type;
};

/**
 * @param {object} schema
 * @param {function} schema.type
 * @param {*} value
 * @returns {boolean}
 */
const isValidInstanceType = (schema, value) => {
  const { type } = schema;
  return value instanceof type;
};

/**
 * Validations for examining pre deserialized data.
 *
 * @param {object} schema       Schema definition for a type.
 * @param {object} entityData   Data returned for a payload.
 */
export const preDeserializationValidation = (schema, entityData) => {
  const { attributes, associations, attributeNameMap, typeName } = schema;
  const id = entityData[Fields.ID];

  // Make sure that all attributes and associations are valid.
  for (const [field, definition] of Iterable({ ...attributes, ...associations })) {
    const { from } = definition;
    const value = entityData[from];

    // Associations are never write only, so treat them as such.
    const writeOnly = definition instanceof Attribute ? definition.writeOnly : false;

    // Ensure the field is present, unless it is write only.
    if (!writeOnly && entityData[from] === undefined) {
      throw new FieldMissingError(typeName, field, id);
    }

    // If a field is write only and it is present, then throw an error.
    if (writeOnly && entityData[from] !== undefined) {
      throw new UnexpectedWriteOnlyFieldError(typeName, field, id);
    }

    if (!isValidNotNull(definition, value)) {
      throw new NotNullError(typeName, field, id);
    }

    if (!isValidCollection(definition, value)) {
      throw new CollectionError(typeName, field, id);
    }
  }

  // Check for unexpected fields.
  Object
    .keys(entityData)
    // Remove reserved fields.
    .filter((field) => (
      field !== Fields.TYPE &&
      field !== Fields.VERSION &&
      field !== Fields.MIGRATED
    ))
    .forEach((field) => {
      // If the field name doesn't map to a destination attribute name, throw an error.
      if (!attributeNameMap.hasOwnProperty(field)) {
        throw new UnexpectedFieldError(typeName, field, id);
      }
    });
};

/**
 * Common validations for post-deserialization data.
 *
 * @param {Record} entity       Data generated from walking the tree.
 */
export const postDeserializationValidation = (entity) => {
  const { schema } = entity;
  const { attributes, typeName } = schema;
  const id = entity.get(Fields.ID);

  const validateType = (field, value) => {
    const attribute = attributes[field];

    if (!isValidType(attribute, value)) {
      throw new AttributeAssignmentError(attribute, value, typeName, field, id);
    }
  };

  Object.keys(attributes).forEach((field) => {
    const value = entity.get(field);

    if (!isNullish(value)) {
      if (List.isList(value)) {
        value.forEach((v) => validateType(field, v));
      } else {
        validateType(field, value);
      }
    }
  });
};

/**
 * Validation for normalized entity.
 *
 * @param {Record} entity       Data generated from walking the tree.
 * @param {Map} state
 */
export const postNormalizedValidation = (entity, state) => {
  const { associations, typeName } = entity.schema;
  const id = entity.get(Fields.ID);

  Object.keys(associations).forEach((field) => {
    const association = associations[field];
    const value = entity.get(field);
    const { storePrefix } = association.type;

    const validatePresence = (v) => {
      if (!state.hasIn([storePrefix, v])) {
        throw new ValidationError(`Unable to find ${v} in ${storePrefix}.`, typeName, field, id);
      }
    };

    if (!isNullish(value)) {
      if (List.isList(value)) {
        value.forEach(validatePresence);
      } else {
        validatePresence(value);
      }
    }
  });
};

/**
 * Validation for nested entity.
 *
 * @param {Record} entity       Data generated from walking the tree.
 */
export const postNestedValidation = (entity) => {
  const { associations, typeName } = entity.schema;
  const id = entity.get(Fields.ID);

  const validateType = (field, value) => {
    const association = associations[field];

    if (!isValidInstanceType(association, value)) {
      throw new AssociationAssignmentError(association, value, typeName, field, id);
    }
  };

  Object.keys(associations).forEach((field) => {
    const value = entity.get(field);

    if (!isNullish(value)) {
      if (List.isList(value)) {
        value.forEach((v) => validateType(field, v));
      } else {
        validateType(field, value);
      }
    }
  });
};
