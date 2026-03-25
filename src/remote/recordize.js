import { List } from 'immutable';
import { deserialize } from './deserialize';
import { postDeserializationValidation, postNestedValidation } from './validate';

/**
 * Takes a response API and turns it into a deeply nested, typed object.
 *
 * @this {ViewModelClient}
 * @param {object} responseData
 * @returns {Record}
 */
export function recordize(responseData) {
  let { data } = deserialize(
    (object) => this.forEntity(object),
    responseData,
    (entityType, entityData) => {
      const entity = new entityType(entityData);
      postDeserializationValidation(entity);
      postNestedValidation(entity);
      return entity;
    });

  if (Array.isArray(data)) {
    data = List(data);
  }

  return data;
}
