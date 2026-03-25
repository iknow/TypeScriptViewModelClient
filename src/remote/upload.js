import Immutable, { List, Iterable, Map } from 'immutable';
import FIELDS from '../utils/Fields';
import { Attribute, Association, ENTITY, EXTERNAL_ASSOCIATION } from '../utils/schema';
import { calculateVersions } from '../utils/versions';
import ViewModelClientError from '../utils/ViewModelClientError';

const longest = (x, y) => (x.size > y.size ? x : y);

export const longestCommonSubsequence = (sequence1, sequence2, options) => {
  const equal = options?.equal ?? Immutable.is;

  // Walk the m*n state space, keeping m*2 immutable chains in memory at
  // once. Use the smallest collection for m, and the larger for n, trading more
  // CPU for less memory.

  const xs = sequence1.size < sequence2.size ? sequence2 : sequence1; // longest
  const ys = sequence1.size < sequence2.size ? sequence1 : sequence2; // shortest

  let prev = new Array(ys.size + 1);
  let curr = new Array(ys.size + 1);

  for (let i = 0; i < prev.length; i++) {
    prev[i] = List();
  }

  // xi and yi index into the string. Since the state space includes an entry
  // for having taken no characters, the location in the state space of the
  // string having handled x[xi] and y[yi] is at curr[yi+1].

  for (let xi = 0; xi < xs.size; xi++) {
    const x = xs.get(xi);
    curr[0] = List();
    for (let yi = 0; yi < ys.size; yi++) {
      curr[yi + 1] = equal(x, ys.get(yi))
        ? prev[yi].push(x) /* take both */
        : longest(curr[yi] /* skip y[yi] */,
        prev[yi + 1] /* skip x[xi] */);
    }

    const temp = prev;
    prev       = curr;
    curr       = temp;
  }

  return prev[ys.size];
};

// Minimal option type. TODO: replace with something more standard.
class Maybe {
  isNothing() {
    return false;
  }

  isJust() {
    return false;
  }

  fromJust() {
    throw new Error('Attempted to call fromJust on Nothing');
  }

  static fromJS(value) {
    if (value) {
      return new Just(value);
    } else {
      return Nothing.instance;
    }
  }
}

class Nothing extends Maybe {
  isNothing() {
    return true;
  }
}
Nothing.instance = new Nothing();

class Just extends Maybe {
  constructor(value) {
    super();
    this.value = value;
  }

  isJust() {
    return true;
  }

  fromJust() {
    return this.value;
  }
}

const collectionAction = (type) => (values) =>
  Immutable.Map.of('_type', type, 'values', values);

const appendAction = collectionAction('append');
const removeAction = collectionAction('remove');
const updateAction = collectionAction('update');

const serializeCollection = (from, to, isNew, elementConstructor,
  { updateEntity, referToEntity, referenceOnly }) => {
  // collection reference
  let collectionActions = List();

  if (isNew) {
    // Entity doesn't exist. Trivial set.
    const childUpdates =
            to.map((childID) => referToEntity(elementConstructor, childID));

    return new Just(childUpdates);
  }

  const referToDeletedEntity = (entityID) =>
    referenceOnly(elementConstructor, entityID);

  const commonEntries  = longestCommonSubsequence(from, to);
  const commonEntrySet = commonEntries.toSet();

  if (commonEntries.isEmpty()) {
    // Nothing in common. Delete everything and append new.
    let actions = List();
    if (!from.isEmpty()) {
      const removedRefs = from.map(referToDeletedEntity);

      actions = actions.push(removeAction(removedRefs));
    }

    if (!to.isEmpty()) {
      const appendChildUpdates = to.map((childID) =>
        referToEntity(elementConstructor, childID));

      actions = actions.push(appendAction(appendChildUpdates));
    }

    if (!actions.isEmpty()) {
      return new Just(Immutable.Map.of('_type', '_update', 'actions', actions));
    } else {
      return Nothing.instance;
    }
  } else {
    // At least one fixed points. Generate a diff to preserve the user's intent.
    let after;
    let before = commonEntries.first();

    let updatedEntities = List();

    let worklist = to;
    while (!worklist.isEmpty()) {
      const newEntry = worklist.first();
      if (commonEntrySet.has(newEntry)) {
        // fixpoint, update state, maybe include edits

        const childUpdate = updateEntity(elementConstructor, newEntry);
        if (childUpdate) {
          updatedEntities = updatedEntities.push(childUpdate);
        }

        after  = newEntry;
        before = null;

        worklist = worklist.rest();
      } else {
        // a run that needs to be inserted somewhere; collect the run
        // and give it a relative position
        const appendRunIDs =
                worklist.takeWhile((childID) => !commonEntrySet.has(childID));

        const childUpdates = appendRunIDs.map((childID) =>
          referToEntity(elementConstructor, childID));

        let appendRunAction = appendAction(childUpdates);
        if (after) {
          appendRunAction = appendRunAction.set(
            'after', referenceOnly(elementConstructor, after));
        } else {
          appendRunAction = appendRunAction.set(
            'before', referenceOnly(elementConstructor, before));
        }
        collectionActions = collectionActions.push(appendRunAction);

        worklist = worklist.skip(appendRunIDs.size);
      }
    }

    const removedEntries = from.filterNot((childID) => to.indexOf(childID) !== -1);

    if (!removedEntries.isEmpty()) {
      const removedRefs = removedEntries.map(referToDeletedEntity);
      collectionActions = collectionActions.push(removeAction(removedRefs));
    }

    if (!updatedEntities.isEmpty()) {
      collectionActions = collectionActions.push(updateAction(updatedEntities));
    }

    if (!collectionActions.isEmpty()) {
      return new Just(Immutable.Map.of('_type', '_update', 'actions', collectionActions));
    } else {
      return Nothing.instance;
    }
  }
};

/**
 * @param {object} attributeSchema
 * @param {*} value
 * @returns {*}
 */
const serializeAttribute = (attributeSchema, value) => {
  const { marshaller } = attributeSchema;
  const serializer = marshaller?.serialize;

  // Treat null as special case that should bypass marshallers.
  if (value === null) {
    return null;
  } else if (typeof serializer === 'function') {
    return serializer(value);
  } else {
    return value;
  }
};

/**
 * @param {object} schema
 * @param {*} value
 * @param {function} callback   Called with schema definition and value.
 */
const serializeProperty = (schema, value, callback) => {
  if (List.isList(value)) {
    return value.map((v) => callback(schema, v));
  } else {
    return callback(schema, value);
  }
};

const serializeReference = (from, to, isNew, targetConstructor,
  { updateEntity, referToEntity, referenceOnly: _ }) => {
  if (isNew || !Immutable.is(from, to)) {
    // new entity or moved entity, must send something,
    if (to) {
      return new Just(referToEntity(targetConstructor, to));
    } else {
      return to === null ? new Just(null) : Nothing.instance;
    }
  } else {
    // same entity (or lack thereof)
    if (to) {
      return Maybe.fromJS(updateEntity(targetConstructor, to));
    } else {
      return Nothing.instance;
    }
  }
};

const makeRefKey = (refIndex) => `ref${refIndex}`;
const makeRefMap = (refKey) => Immutable.Map.of(FIELDS.REF, refKey);
const makeSerializedPayload = (data, references, versions) => Immutable.Map({
  data,
  references,
  versions,
}).toJS();

/**
 * @this {ViewModelClient}
 * @param {Map} localMap - Entity database with local changes applied to it.
 * @param {Map} remoteMap - Entity database that is unchanged.
 * @param {Record.Class} type - Entity constructor.
 * @param {string} rootID - ID of entity being updated.
 * @returns {Map} - Payload that can be sent to the server.
 */
export function serializeEdits(localMap, remoteMap, type, rootID, options = {}) {
  let nextRefIndex  = 1;
  let references    = Immutable.Map();
  let entityRefMaps = Immutable.Map();
  const rootStorePrefix = type.storePrefix;
  const {
    serializeShared = true,
  } = options;

  const internSharedEntityUpdate = (storePrefix, id, generateUpdate) => {
    const entityKey = Immutable.List.of(storePrefix, id);
    if (entityRefMaps.has(entityKey)) {
      return entityRefMaps.get(entityKey);
    }

    const update = generateUpdate();

    if (update) {
      const refKey  = makeRefKey(nextRefIndex++);
      const refMap  = makeRefMap(refKey);
      entityRefMaps = entityRefMaps.set(entityKey, refMap);
      references    = references.set(refKey, update);
      return refMap;
    } else {
      return null;
    }
  };

  const referenceOnly = (elementConstructor, id) => {
    const { storePrefix } = elementConstructor;
    return (
      // Try to find entity in local or remote map to get correct type in case
      // it is a polymorphic entity.
      localMap.getIn([storePrefix, id])?.makeReference() ??
      remoteMap.getIn([storePrefix, id])?.makeReference() ??
      elementConstructor.makeReferenceForId(id)
    );
  };

  // These generators handle the recursive nature of this function, and
  // abstract out the details of shared references.

  // They export three functions:
  //
  //  referenceOnly: a {_type, id} map for anchors
  //
  //  updateEntity: qenerate an update for an entity, or null if the entity
  //                has no changes
  //
  //  referToEntity: Generate an update for an entity, or if no changes, a
  //                 reference to that entity.

  const ownedGenerator = {
    referenceOnly,

    updateEntity(entityConstructor, id) {
      const { storePrefix } = entityConstructor;
      return serializeTree1(storePrefix, id);
    },

    referToEntity(entityConstructor, id) {
      const { storePrefix } = entityConstructor;
      return serializeTree1(storePrefix, id) ?? localMap.getIn([storePrefix, id]).makeReference();
    },
  };

  const sharedGenerator = {
    referenceOnly,

    updateEntity(entityConstructor, id) {
      const { storePrefix } = entityConstructor;
      return internSharedEntityUpdate(storePrefix, id, () => (
        serializeShared ? ownedGenerator.updateEntity(entityConstructor, id) :
        // When `serializeShared` is false, we never want to encode updates to shared entities.
        // Note that we will still encode the reference itself changing, via the logic in
        // `serializeReference` and `serializeCollection` which checks if the ID itself has changed.
        // This only stops unnecessarily encoding a reference when the reference has not changed.
        null
      ));
    },

    referToEntity(entityConstructor, id) {
      const { storePrefix } = entityConstructor;
      return internSharedEntityUpdate(storePrefix, id, () => (
        serializeShared ? ownedGenerator.referToEntity(entityConstructor, id) :
        entityConstructor.makeReferenceForId(id)
      ));
    },
  };

  const maybeSharedGenerator = {
    referenceOnly,

    updateEntity(entityConstructor, id) {
      const { storePrefix } = entityConstructor;
      const schema = localMap.getIn([storePrefix, id])?.schema || entityConstructor;
      return (
        schema.root ?
          sharedGenerator.updateEntity(schema, id) :
          ownedGenerator.updateEntity(schema, id)
      );
    },

    referToEntity(entityConstructor, id) {
      const { storePrefix } = entityConstructor;
      const schema = localMap.getIn([storePrefix, id])?.schema || entityConstructor;
      return (
        schema.root ?
          sharedGenerator.referToEntity(schema, id) :
          ownedGenerator.referToEntity(schema, id)
      );
    },
  };

  const serializeTree1 = (storePrefix, id) => {
    const base    = remoteMap.getIn([storePrefix, id]);
    const updated = localMap.getIn([storePrefix, id]);

    if (!updated) {
      return null;
    }

    // base and updated must have the same type, type changes are not supported

    let updates = Immutable.Map();

    if (!base) {
      updates = updates.set(FIELDS.NEW, true);
    }

    const { attributes, associations } = updated.schema;

    for (const [key, attributeSchema] of Iterable(attributes)) {
      const { from } = attributeSchema;
      const newValue = updated.get(key);

      if (!base || !Immutable.is(base.get(key), newValue)) {
        if (newValue !== undefined) {
          const update = serializeProperty(attributeSchema, newValue, serializeAttribute);
          updates = updates.set(from, update);
        }
      }
    }

    for (const [key, associationSchema] of Iterable(associations)) {
      const { type: schemaType, collection, from: source, shared } = associationSchema;
      const { typeName, root } = schemaType;
      // If `shared: 'maybe'`, `maybeSharedGenerator` checks for `root: true` on
      // the schema of the actual entity in `localMap` to determine if the
      // entity should be serialized as a shared reference. This is necessary
      // for polymorphic entities which have some sub-types which are shared
      // entities and some sub-types which are owned entities.
      //
      // Otherwise, we check for `shared: true` on the association schema or
      // `root: true` on the type that the association schema references to
      // determine if we should serialize as a shared reference.
      const generator = (
        shared === 'maybe' ? maybeSharedGenerator :
        (shared === true || root) ? sharedGenerator :
        ownedGenerator
      );
      const serialize         = collection ? serializeCollection : serializeReference;

      // Call getStorePrefixByTypeName for the side effect of throwing an error if the type is not
      // registered.
      this.getStorePrefixByTypeName(typeName);

      const from   = base?.get(key);
      const to     = updated.get(key);
      const update = serialize(from, to, !base, schemaType, generator);

      if (update.isJust()) {
        updates = updates.set(source, update.fromJust());
      }
    }

    if (!updates.isEmpty()) {
      let metadata      = updated.makeReference();
      const lockVersion = updated.get(FIELDS.LOCK_VERSION);
      if (lockVersion !== undefined) {
        metadata = metadata.set(FIELDS.LOCK_VERSION, lockVersion);
      }
      return updates.merge(metadata);
    } else {
      return null;
    }
  };

  const serializeExternalAssociation = (storePrefix, id) => {
    const { associationType } = type;
    const base    = remoteMap.getIn([storePrefix, id]);
    const updated = localMap.getIn([storePrefix, id]);

    if (!updated) {
      return null;
    }

    const edits = serializeCollection(
      base,
      updated,
      false,
      associationType,
      ownedGenerator,
    );

    if (edits.isJust()) {
      return edits.fromJust();
    } else {
      return null;
    }
  };

  let data;
  if (type.kind === ENTITY) {
    data = serializeTree1(rootStorePrefix, rootID);
  } else if (type.kind === EXTERNAL_ASSOCIATION) {
    data = serializeExternalAssociation(rootStorePrefix, rootID);
  } else {
    throw new ViewModelClientError('Serializing an unknown type');
  }

  return makeSerializedPayload(data, references, calculateVersions(type));
}

/**
 * Serializes a nested entity object. This should be used with types that can be recordized and is
 * not intended for performing updates/edits.
 *
 * @param {Record} base
 * @returns {Map}
 */
export function serializeEntity(base) {
  let nextRefIndex = 1;
  // Entity reference to ref key.
  const entityRefMap = Immutable.Map().asMutable();
  // Ref key to serialized reference.
  const references = Immutable.Map().asMutable();

  /**
   * @param {Record} entity
   * @returns {Map}
   */
  const serialize = (entity) => {
    const { attributes, associations, typeName, version } = entity.schema;

    return Map(entity)
      .filter((value) => value !== undefined)
      .mapEntries(([key, value]) => {
        const schema = attributes[key] || associations[key];
        const { from } = schema;
        let serializedValue;

        if (schema instanceof Attribute) {
          serializedValue = serializeProperty(schema, value, serializeAttribute);
        } else if (schema instanceof Association) {
          serializedValue = serializeProperty(schema, value, serializeAssociation);
        } else {
          const dump = JSON.stringify(entity);
          throw new Error(`Cannot find definition for ${key} when trying to serialize: ${dump}.`);
        }

        return [from, serializedValue];
      })
      .set(FIELDS.TYPE, typeName)
      .set(FIELDS.VERSION, version);
  };

  /**
   * @param {object} associationSchema
   * @param {Record} entity
   * @returns {Map}  reference map.
   */
  const serializeAssociation = (associationSchema, entity) => {
    const { type, shared } = associationSchema;

    if (entity !== null) {
      return (shared || type.root) ? serializeRef(entity) : serialize(entity);
    } else {
      return entity;
    }
  };

  /**
   * Serializes the reference and puts the refId in its place.
   *
   * @param {Record} entity
   * @returns {Map}
   */
  const serializeRef = (entity) => {
    // TODO: Will/Can a reference be shared that doesn't have an ID?
    // This isn't a problem for deserialization but there is no guaranteed
    // identifying property to ensure that two references should be the same.
    let refKey = entityRefMap.get(entity);

    if (refKey === undefined) {
      const serializedEntity = serialize(entity);
      refKey = makeRefKey(nextRefIndex++);
      entityRefMap.set(entity, refKey);
      references.set(refKey, serializedEntity);
    }

    return makeRefMap(refKey);
  };

  const data = Array.isArray(base) || List.isList(base) ? base.map(serialize) : serialize(base);
  const baseTypes = (
    Array.isArray(base) || List.isList(base) ? base.map((entity) => entity.schema) : base.schema
  );
  return makeSerializedPayload(data, references, calculateVersions(baseTypes));
}
