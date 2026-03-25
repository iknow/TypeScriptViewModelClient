import { List } from 'immutable';
import { ENTITY, EXTERNAL_ASSOCIATION } from './schema';

/**
 * @param {object} rootType Root type constructor
 * @returns {object} Mapping of type name to version number for each type nested
 *                   inside the given root type.
 */
export const calculateVersions = (rootTypeOrTypes) => {
  const possibleVersions = {};

  const walk = (type) => {
    const { typeName, version, kind } = type;

    if (possibleVersions.hasOwnProperty(typeName)) {
      if (possibleVersions[typeName] !== version) {
        throw new Error(
          `Multiple versions for ${typeName}: ${possibleVersions[typeName]} and ${version}`,
        );
      }

      // Prevent infinite loops. This may happen if multiple subtypes reference
      // the same type, for example.
      return;
    }

    if (kind === EXTERNAL_ASSOCIATION) {
      // External associations don't have versions, so just walk the referenced type.
      walk(type.associationType);
    } else if (kind === ENTITY) {
      possibleVersions[typeName] = version;

      // Walk association types
      for (const associationSchema of Object.values(type.associations)) {
        walk(associationSchema.type);
      }

      // Walk subtypes
      if (type.subtypes) {
        for (const subtype of Object.values(type.subtypes)) {
          walk(subtype);
        }
      }
    }
  };

  if (Array.isArray(rootTypeOrTypes) || List.isList(rootTypeOrTypes)) {
    rootTypeOrTypes.forEach(walk);
  } else {
    walk(rootTypeOrTypes);
  }

  return possibleVersions;
};
