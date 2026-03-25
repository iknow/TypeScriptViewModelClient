import * as Immutable from 'immutable';
import EntityDB, { BaseEntityDB } from '../api/EntityDB';
import ViewModelCodec from '../api/ViewModelCodec';
import StateContainer  from '../api/StateContainer';
import {
  referencesKey,
} from '../codecs/RefType';
import {
  encodingEntityDbKey,
  fromEntityDbKey,
} from '../codecs/HandleType';
import {
  allEntitiesDbKey,
  oldEntitiesDbKey,
} from '../codecs/EntityType';
import { nested } from '../codecs/NestedType';
import { encodeLockVersionKey } from '../codecs/LockVersionType';
import TypeIdRecord from '../shared/TypeIdRecord';
import { ICommonEncodeArgs, EncodeReturn } from './encodeRequest';
import getEntityVersions from './getEntityVersions';

/**
 * Like `encodeRequest`, but instead of simply encoding the given data, it
 * produces a response object containing only the functional updates needed to
 * update the data in `fromValue` to match the data in `toValue`. If the given
 * codec contains any `handle()` codecs, you should also pass `EntityDB`
 * instances to `fromDb` and `toDb` to resolve any handles inside `fromValue`
 * and `toValue`.
 */
export default function encodeDiffRequest<T, OutputT>({
  fromDb = EntityDB.emptyDb,
  fromValue,
  toDb = EntityDB.emptyDb,
  toValue,
  codec,
  encodeLockVersion = true,
  state = new StateContainer(),
}: ICommonEncodeArgs & {
  /**
   * Arbitrary codec to use to encode the diff from `fromValue` to `toValue`.
   */
  codec: ViewModelCodec<T, OutputT>;
  /**
   * `EntityDB` used for dereferencing any handles inside `fromValue`. Only
   * useful if `handle()` codecs are using within `codec`.
   */
  fromDb?: BaseEntityDB;
  /**
   * The base value for the diff. Must match the type of `codec`.
   */
  fromValue: T;
  /**
   * `EntityDB` used for dereferencing any handles inside `toValue`. Only useful
   * if `handle()` codecs are using within `codec`.
   */
  toDb?: BaseEntityDB;
  /**
   * The target value for the diff. Must match the type of `codec`.
   */
  toValue: T;
}): EncodeReturn<OutputT | null> {
  // Pass in state.current so that `firstPassState` has the same initial state as the provided state
  const firstPassState = new StateContainer(state.current);
  firstPassState.set(encodeLockVersionKey, encodeLockVersion);
  firstPassState.set(encodingEntityDbKey, fromDb);
  firstPassState.set(allEntitiesDbKey, Immutable.Map<TypeIdRecord, unknown>());

  // The first pass is only to walk `fromValue`/`fromDb` and build up `oldEntitiesDb`.
  //
  // Note that want to support mixing nested and normalized entities in a single
  // codec, so we must traverse both `fromValue` and `fromDb` to find all old
  // entities.
  for (const [handle, entity] of fromDb.entries()) {
    const entityCodec = nested(handle.type);
    entityCodec.encodeWithState(entity, firstPassState);
  }
  codec.encodeWithState(fromValue, firstPassState);
  const oldEntitiesDb = firstPassState.get(allEntitiesDbKey);

  state.set(encodeLockVersionKey, encodeLockVersion);
  state.set(encodingEntityDbKey, toDb);
  state.set(oldEntitiesDbKey, oldEntitiesDb);
  state.set(fromEntityDbKey, fromDb);

  const data = codec.encodeDiffWithState(fromValue, toValue, state) ?? null;

  // The encoders may add references, so `encodeDiffWithState()` must be called
  // first before getting the final references.
  const references = state.get(referencesKey);

  const versions = getEntityVersions(codec);

  return {
    data,
    references,
    versions,
  };
}
