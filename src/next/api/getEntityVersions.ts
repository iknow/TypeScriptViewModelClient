import { AnyCodec } from '../api/ViewModelCodec';
import getEntityTypes from './getEntityTypes';

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface IVersionMap {
  // Use undefined to make the types more safe. However, `getEntityVersions()`
  // will not directly set a key to `undefined`.
  [typeName: string]: number | undefined;
}

/**
 * Given an arbitrary `ViewModelCodec` codec, it traverses the tree of types
 * that the codec represents and finds any `EntityType` codecs within the tree,
 * returning a mapping of each entity's type name to its version number.
 *
 * It will throw if it finds multiple conflicting versions for the same entity
 * type, and it will log a warning if it finds a codec that it doesn't know how
 * to traverse. To tell `getEntityVersions()` how to traverse the codec, add a
 * `.childTypes` property to the codec containing an array of all codecs
 * contained within it if it is a higher order codec, or an empty array if it's
 * not a higher order codec.
 */
export default function getEntityVersions(rootType: AnyCodec): IVersionMap {
  const versions: IVersionMap = {};

  for (const { typeName, version } of getEntityTypes(rootType)) {
    if (version === undefined) {
      continue;
    }

    if (versions[typeName] !== undefined && versions[typeName] !== version) {
      throw new Error(
        'Cannot have multiple versions of the same type in a single request:' +
        `${typeName} had versions ${versions[typeName]} and ${version}`,
      );
    }

    versions[typeName] = version;
  }

  return versions;
}
