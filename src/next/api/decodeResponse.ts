import * as v from '../codecs/ioTs';
import decodeOrThrow from '../shared/decodeOrThrow';
import { DecodedEntityDB } from '../api/EntityDB';
import ViewModelCodec, { DecodedTypeOf, AnyCodec } from '../api/ViewModelCodec';
import StateContainer, { ImmutableStateContainer } from '../api/StateContainer';
import { referencesKey, IReferences } from '../codecs/RefType';
import { decodingEntityDbKey } from '../codecs/HandleType';
import ViewModelFields from '../shared/ViewModelFields';

const unknownResponseCodec: ViewModelCodec<{ references: IReferences | undefined; }> = v.type({
  references: v.union([
    v.undefined,
    v.record(v.string, v.type({
      [ViewModelFields.Type]: v.string,
    })),
  ]),
});

interface IBaseArgs<C extends AnyCodec> {
  /**
   * Raw view-model response object. Expected to contain at least a `data`
   * property, and optionally `references` or `meta` properties.
   */
  response: unknown;
  /**
   * Arbitrary codec used for parsing `data` attribute in response.
   */
  codec: C;
  /**
   * Initial state for state container, which can be used to shared state across
   * codecs during decoding. Only useful if using custom codecs that use the
   * `state` argument in `validateWithState`.
   */
  initialState?: ImmutableStateContainer;
}

interface IBaseReturn<C extends AnyCodec> {
  /**
   * The result of decoding with `codec`
   */
  data: DecodedTypeOf<C>;
  /**
   * An `EntityDB` containing any entities that are referenced using handles.
   * Only useful if `handle()` codecs are used within the
   * given codecs.
   */
  entityDb: DecodedEntityDB;
  /**
   * The final state for the state container (i.e. the value of the `state`
   * argument in `validateWithState`, `encodeWithState`, and
   * `encodeDiffWithState`). Only useful if using custom codecs that put some
   * information in `state` which needs to be extracted after decoding.
   */
  finalState: ImmutableStateContainer;
}

/**
 * Takes a raw view model response (i.e. a JSON object of the form `{ data, references }`)
 * and a codec, and returns a the `data` parsed with the given codec.
 *
 * It also returns an `entityDb` property containing a `DecodedEntityDB`
 * instance containing the entities referenced by any `handle()` codecs within
 * the given codec. (If the codec contains no `handle()`s, then `entityDb` will
 * be `DecodedEntityDB.emptyDb`.) If you have a `DecodedEntityDB` as persisted
 * state in your app, then you can use the `DecodedEntityDB`'s `.merge()`
 * method to merge the returned DB into your app's `DecodedEntityDB`.
 *
 * You may optionally also specify a `metaCodec` codec for decoding the
 * response's `meta` field. Similarly, any `handle()`s will add
 * entities to the resulting `entityDb`.
 */
export default function decodeResponse<
  C extends AnyCodec,
  MetaCodec extends AnyCodec,
>(args: IBaseArgs<C> & {
  /**
   * Arbitrary codec for parsing data in the `meta` attribute, which can
   * contain `supplementary` and `search` properties.
   */
  metaCodec: MetaCodec;
}): IBaseReturn<C> & {
  /**
   * The result of decoding with `metaCodec`
   */
  meta: DecodedTypeOf<MetaCodec>;
};
export default function decodeResponse<
  C extends AnyCodec,
>(args: IBaseArgs<C>): IBaseReturn<C>;
export default function decodeResponse({
  response,
  codec,
  metaCodec,
  initialState = ImmutableStateContainer.emptyState,
}: {
  response: unknown;
  codec: ViewModelCodec<unknown>;
  metaCodec?: ViewModelCodec<unknown>;
  initialState?: ImmutableStateContainer;
}): {
  data: unknown;
  meta?: unknown;
  entityDb: DecodedEntityDB;
  finalState: ImmutableStateContainer;
} {
  const state = new StateContainer(initialState);

  const { references } = decodeOrThrow(unknownResponseCodec, response, state);

  state.set(referencesKey, references ?? {});

  const {
    data,
    meta,
  } = decodeOrThrow(v.type({
    data: codec,
    meta: metaCodec ?? v.unknown,
  }), response, state);

  return {
    data,
    meta: metaCodec ? meta : undefined,
    entityDb: state.get(decodingEntityDbKey),
    finalState: state.current,
  };
}
