import { fromJS, Iterable, List } from 'immutable';
import { preDeserializationValidation, SharedReferenceError } from './validate';
import Fields from '../utils/Fields';

/**
 * @param {object} attribute  Schema for attribute.
 * @param {*} value
 * @returns {*}
 */
export const deserializeAttribute = (attribute, value) => {
  const { collection } = attribute;

  const deserializeValue = (v) => {
    const { marshaller } = attribute;
    const deserializer = marshaller?.deserialize;

    if (typeof deserializer === 'function') {
      return deserializer(v);
    } else {
      return fromJS(v);
    }
  };

  if (value === null) {
    return null;
  } else if (collection) {
    return List(value).map((x) => deserializeValue(x));
  } else {
    return deserializeValue(value);
  }
};

/**
 * Helper for transforming and deserializing fields returned from a response.
 *
 * @param {function} getClass      Function to find a class for an entity object in the payload.
 * @param {object?} responseData
 * @param {function} post          Post hook to perform any additional changes on transformed data.
 * @returns {*}                    The value returned by post.
 */
export const deserialize = (getClass, responseData, post) => {
  if (!responseData || typeof responseData !== 'object') {
    throw new Error(`Expected responseData to be an object, but got: ${responseData}`);
  }

  const walk = (entityObject) => {
    const entityType = getClass(entityObject);
    const entityData = {};

    // Perform validation on the object before building the transformed data.
    preDeserializationValidation(entityType, entityObject);

    entityData[Fields.MIGRATED] = entityObject[Fields.MIGRATED];

    // Transfer and deserialize attributes.
    for (const [name, attribute] of Iterable(entityType.attributes)) {
      const { from } = attribute;

      if (entityObject.hasOwnProperty(from)) {
        const value = entityObject[from];
        entityData[name] = deserializeAttribute(attribute, value);
      }
    }

    // Make sure API is returning expected values and recursively iterate on the schema.
    for (const [name, association] of Iterable(entityType.associations)) {
      const { type, shared, collection, from } = association;

      // Transfer and walk into association.
      if (entityObject.hasOwnProperty(from)) {
        const isRefValue = (v) => typeof v?.[Fields.REF] === 'string';
        const recurse = (v) => (
          // If `shared: 'maybe'`, we don't know if the association should be
          // shared or not without knowing the actual entity type, but we need
          // to dereference the entity to know its type. So we simply support
          // both deserializing as a shared ref or as an owned entity, and never
          // check if this matches with the schema definition. This is necessary
          // for polymorphic entities which have some sub-types which are shared
          // entities and some sub-types which are owned entities.
          //
          // Otherwise, we check for `shared: true` on the association schema
          // or `root: true` on the type that the association schema references
          // to determine if we should deserialize as a shared reference.
          ((shared === 'maybe' && isRefValue(v)) || shared === true || type.root) ?
            walkRefTree(v) :
            walk(v)
        );
        const value  = entityObject[from];
        entityData[name] = value && (collection ? List(value.map(recurse)) : recurse(value));
      }
    }

    return post(entityType, entityData);
  };

  const walkRefTree = makeWalkRefTree(walk, responseData);

  const { data } = responseData;

  const result = {
    data: Array.isArray(data) ? data.map(walk) : walk(data),
  };

  return result;
};

/**
 * Takes a `walk` function that takes raw entity objects from a response, and
 * returns a `walkRefTree` function that takes reference objects (i.e.  objects
 * containing a `_ref` field). `walkRefTree` will dereference the reference
 * object and call `walk` with the resulting entity object, and memoize the
 * result.
 */
const makeWalkRefTree = (walk, responseData) => {
  const { references } = responseData;
  const hasReferences  = responseData.hasOwnProperty('references');

  const walkedRefTrees = {};

  const walkRefTree = (reference) => {
    const refHash = reference[Fields.REF];

    if (!walkedRefTrees.hasOwnProperty(refHash)) {
      if (!hasReferences || !references.hasOwnProperty(refHash)) {
        throw new SharedReferenceError(reference);
      }

      walkedRefTrees[refHash] = walk(references[refHash]);
    }

    return walkedRefTrees[refHash];
  };

  return walkRefTree;
};
