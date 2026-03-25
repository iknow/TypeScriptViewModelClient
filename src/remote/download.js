import { is, List } from 'immutable';
import Fields from '../utils/Fields';
import { EXTERNAL_ASSOCIATION } from '../utils/schema';
import ViewModelClientError from '../utils/ViewModelClientError';
import { deserialize } from './deserialize';
import {
  NormalizeNonPersistedError,
  postDeserializationValidation,
  postNormalizedValidation,
} from './validate';

/**
 * Creates a function that applies changes to an entity database from a server response.
 *
 * @this {ViewModelClient}
 * @param {Map} state         Should be a map representing the entities database.
 * @param {any} responseData
 * @returns {Map}
 */
export function update(state, responseData) {
  let newState = state;

  deserialize(
    (object) => this.forEntity(object),
    responseData,
    (entityType, entityData) => {
      const { persisted, storePrefix, typeName } = entityType;

      if (!persisted) {
        throw new NormalizeNonPersistedError(typeName);
      }

      const id = entityData[Fields.ID];

      const cachedEntity = newState.getIn([storePrefix, id]);
      const mostUpToDateView = cachedEntity ?
        cachedEntity.merge(entityData) :
        new entityType(entityData);

      // Perform some post validations.
      postDeserializationValidation(mostUpToDateView);
      postNormalizedValidation(mostUpToDateView, newState);

      if (!cachedEntity || !is(mostUpToDateView, cachedEntity)) {
        newState = newState.setIn([storePrefix, id], mostUpToDateView);
      }

      return id;
    });

  return newState;
}

/**
 * In addition to changes performed by update, this will also store a list of
 * the entity ids in the state under the specified external association and id.
 *
 * @this {ViewModelClient}
 * @param {Map} state         Should be a map representing the entities database.
 * @param {any} responseData
 * @param {any} type          Type object of the external association
 * @param {id}  id            Id of the external association
 * @returns {Map}
 */
export function updateExternalAssociation(state, responseData, type, id) {
  if (type.kind !== EXTERNAL_ASSOCIATION) {
    throw new ViewModelClientError(`${JSON.stringify(type)} is not an external association type`);
  }
  const { data } = responseData;
  if (!Array.isArray(data)) {
    throw new ViewModelClientError('External associations only support lists');
  }
  let newState = this.update(state, responseData);
  const ids = data.map((entityData) => entityData[Fields.ID]);
  newState = newState.setIn([type.storePrefix, id], List(ids));
  return newState;
}
