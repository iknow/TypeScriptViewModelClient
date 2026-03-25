import { Iterable } from 'immutable';
import Fields from './Fields';
import ViewModelClientError from '../utils/ViewModelClientError';

export class TypeRegistryError extends ViewModelClientError {
  name = 'TypeRegistryError';
}

class TypeRegistry {
  constructor() {
    this.types = new Map();
  }

  /**
   * Finds the appropriate constructor for an object.
   *
   * @param {Object} object
   * @returns {Function}
   */
  forEntity(object) {
    const typeName = object[Fields.TYPE];
    const version = object[Fields.VERSION];

    if (!this.types.has(typeName)) {
      throw new TypeRegistryError(
        `Unable to find type for ${typeName}. Passed ${JSON.stringify(object)}.`);
    }

    const Constructor = this.types.get(typeName);

    if (version !== Constructor.version) {
      throw new TypeRegistryError(
        `Mismatched versions on type ${typeName}. ` +
        `Local version is ${Constructor.version}. Provided with ${version}.`);
    }

    return Constructor;
  }

  /**
   * @param {string} typeName
   * @returns {Set}
   */
  getStorePrefixes() {
    return Iterable(this.types.values()).map((type) => type.storePrefix).toSet();
  }

  /**
   * @param {string} typeName
   * @returns {string}
   */
  getStorePrefixByTypeName(typeName) {
    if (!this.types.has(typeName)) {
      throw new TypeRegistryError(`Unable to find type: ${typeName}.`);
    }

    return this.types.get(typeName).storePrefix;
  }

  /**
   * @param {string} typeName
   * @returns {boolean}
   */
  isTypeShared(typeName) {
    if (!this.types.has(typeName)) {
      throw new TypeRegistryError(`Unable to find type: ${typeName}.`);
    }

    return this.types.get(typeName).shared;
  }
}

export default TypeRegistry;
