import { update, updateExternalAssociation } from './remote/download';
import { recordize } from './remote/recordize';
import { serializeEdits, serializeEntity } from './remote/upload';
import {
  ENTITY,
  EXTERNAL_ASSOCIATION,
  Attribute,
  Association,
  parseSchema,
  recordFromSchema,
  parseExternalAssociationSchema,
} from './utils/schema';
import { calculateVersions } from './utils/versions';
import Fields from './utils/Fields';
import NamingStrategies from './utils/NamingStrategies';
import TypeRegistry from './utils/TypeRegistry';
import ViewModelClientError from './utils/ViewModelClientError';

export { Attribute, Association, Fields, NamingStrategies, ENTITY, EXTERNAL_ASSOCIATION };

class ViewModelClient extends TypeRegistry {
  /**
   * @param {object} options
   * @param {function?} options.namingStrategy  Mapper for internal property names to external (API)
   *                                           property names.
   */
  constructor(options = {}) {
    super();

    this.namingStrategy = options.namingStrategy ?? NamingStrategies.CAMEL_CASE_TO_UNDERSCORE;
  }

  /**
   * Registers a type to the view model client based on a JSON representation of the schema.
   *
   * @param {object}    schema
   * @param {string}    schema.typeName
   * @param {number}    schema.version
   * @param {function}  schema.extends
   * @param {boolean}   schema.persisted
   * @param {boolean}   schema.lockable
   * @param {boolean}   schema.root
   * @param {string}    schema.storePrefix
   * @param {object}    schema.attributes
   * @param {string}    schema.attributes[].type
   * @param {boolean}   schema.attributes[].collection
   * @param {boolean}   schema.attributes[].notNull
   * @param {object}    schema.attributes[].marshaller.deserialize
   * @param {object}    schema.attributes[].marshaller.serialize
   * @param {string}    schema.attributes[].from
   * @param {boolean}   schema.attributes[].writeOnly
   * @param {object}    schema.associations
   * @param {function}  schema.associations[].type
   * @param {boolean}   schema.associations[].collection
   * @param {boolean}   schema.associations[].notNull
   * @param {boolean}   schema.associations[].shared
   * @param {string}    schema.associations[].from
   * @returns {function}   constructor for the schema
   */
  defineClass(schema = {}) {
    const { namingStrategy } = this;
    const types = new Set(this.types.values());

    const parsedSchema = parseSchema(schema, { namingStrategy, types });
    const type = recordFromSchema(parsedSchema);

    const { typeName } = type;

    if (this.types.has(typeName)) {
      throw new ViewModelClientError(`${typeName} has already been defined.`);
    }

    this.types.set(typeName, type);

    // Mutate parent constructor so child constructor can be accessed.
    if (typeof type.extends !== 'undefined') {
      type.extends.registerSubtype(type);
    }

    return type;
  }

  /**
   * Registers a type to the view model client based on a JSON representation of the schema.
   *
   * @param {object}    schema
   * @param {string}    schema.typeName
   * @param {string}    schema.storePrefix
   * @param {object}    schema.associationType
   * @returns {object}   descriptor for the schema
   */
  defineExternalAssociation(schema = {}) {
    const types = new Set(this.types.values());
    const type = parseExternalAssociationSchema(schema, types);
    const { typeName } = type;

    if (this.types.has(typeName)) {
      throw new ViewModelClientError(`${typeName} has already been defined.`);
    }

    this.types.set(typeName, type);
    return type;
  }

  /**
   * @param {object} responseData
   * @returns {Record}
   */
  recordize(...args) {
    return recordize.call(this, ...args);
  }

  /**
   * @param {Map} localMap            Entity database with local changes applied to it.
   * @param {Map} remoteMap           Entity database that is unchanged.
   * @param {string} rootStorePrefix  Store prefix for entity being updated.
   * @param {string} rootID           ID of entity being updated.
   * @returns {Map}                   Payload that can be sent to the server.
   */
  serializeEdits(...args) {
    return serializeEdits.call(this, ...args);
  }

  /**
   * @param {Record} entity
   * @returns {Map}
   */
  serializeEntity(entity) {
    return serializeEntity.call(this, entity);
  }

  /**
   * @param {Map} state             Should be a map representing the entities database.
   * @param {object} responseData
   * @returns {Map}
   */
  update(...args) {
    return update.call(this, ...args);
  }

  /**
   * @param {Map} state             Should be a map representing the entities database.
   * @param {object} responseData
   * @param {object} type
   * @param {string} id
   * @returns {Map}
   */
  updateExternalAssociation(...args) {
    return updateExternalAssociation.call(this, ...args);
  }
}

export { ViewModelClientError, calculateVersions };
export default ViewModelClient;
