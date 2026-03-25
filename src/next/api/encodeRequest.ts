import EntityDB, { BaseEntityDB } from '../api/EntityDB';
import ViewModelCodec from '../api/ViewModelCodec';
import StateContainer from '../api/StateContainer';
import {
  referencesKey,
  IReferences,
} from '../codecs/RefType';
import { encodingEntityDbKey } from '../codecs/HandleType';
import { encodeLockVersionKey } from '../codecs/LockVersionType';
import { encodeVersionKey } from '../codecs/EntityType';
import getEntityVersions, { IVersionMap } from './getEntityVersions';

export interface ICommonEncodeArgs {
  /**
   * If false, fields using the `lockVersion` codec will not be encoded. If
   * true, they will be encoded normally.
   *
   * Can be set to false if you don't want any locking with your update.
   *
   * Defaults to true.
   */
  encodeLockVersion?: boolean;
  /**
   * State container which can be used to shared state across codecs during
   * decoding. Only useful if there is a need to reference the state externally
   * or when using custom codecs that use the `state` argument in `encodeWithState`
   * or `encodeDiffWithState`.
   */
  state?: StateContainer;
}

// Use type instead of interface so that this is assignable to `Record<string,
// unknown>`, without having to add an index type.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type EncodeReturn<D> = {
  /**
   * The encoded data returned by `codec`.
   */
  data: D;
  /**
   * Any encoded references used in `data`.
   */
  references: IReferences;
  /**
   * A mapping of type name to version number for every entity type within
   * `codec`. Used by the backend to support automatic view-level migrations,
   * allowing old clients with old schema versions to continue working after a
   * backend schema change.
   */
  versions: IVersionMap;
};

/**
 * Given an `ViewModelCodec` and a value matching that codec, encodes the value
 * as a view model response object (i.e. an object containing `{ data,
 * references }`). If the given codec uses any `handle()`s, then you should also
 * pass an `entityDb` argument with an `EntityDB` instance that can be used to
 * resolve any handles to the corresponding entity instance.
 */
export default function encodeRequest<T, OutputT>({
  entityDb = EntityDB.emptyDb,
  codec,
  value,
  encodeLockVersion = true,
  encodeVersion = false,
  state = new StateContainer(),
}: ICommonEncodeArgs & {
  /**
   * Arbitrary codec to use to encode the given `value`.
   */
  codec: ViewModelCodec<T, OutputT>;
  /**
   * Value to be encoded. Must match the type of `codec`.
   */
  value: T;
  /**
   * An `EntityDB` that should contain any entities referenced via handles
   * within the given `value`. Only useful if `handle()` is used within `codec`.
   */
  entityDb?: BaseEntityDB;
  /**
   * If true, adds a `_version` field when encoding entities. This is mainly to
   * support encoding an entity in such a way that it can be decoded by
   * `view-model`'s `update()` method, as a roundabout way of converting a
   * `view-model/next` entities to `view-model` entities.
   *
   * Defaults to false.
   */
  encodeVersion?: boolean;
}): EncodeReturn<OutputT> {
  state.set(encodingEntityDbKey, entityDb);
  state.set(encodeLockVersionKey, encodeLockVersion);
  state.set(encodeVersionKey, encodeVersion);

  const data = codec.encodeWithState(value, state);

  // The encoders may add references, so `encodeWithState()` must be called
  // first before getting the final references.
  const references = state.get(referencesKey);

  const versions = getEntityVersions(codec);

  return {
    data,
    references,
    versions,
  };
}
