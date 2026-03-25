// The nature of the code here relies on using `any`
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Either } from 'fp-ts/lib/Either';
import StateContainer from './StateContainer';

/**
 * This is the fundamental type of the API. It is very similar to an `io-ts`
 * codec (as of `io-ts` version 2), but with a few differences:
 *
 * 1. It has an `encodeDiffWithState` method, for encoding some representation
 * of a diff from one value to another. In practice, this is used by
 * `encodeDiffRequest` to encode "functional updates", which is an encoding of
 * operations that the backend API can consume to make changes to collections of
 * entities.
 * 2. Instead of `validate` and `encode` methods, it has `validateWithState` and
 * `encodeWithState` methods which take a `StateContainer` object as a third
 * argument. A `StateContainer` can be used by codecs to store arbitrary data
 * that can be accessed by other codecs. This is used for several things, such
 * as keeping track of the `references` in a view model request/response.
 * 3. It has a `getChildCodecs` method, which can be used to traverse a tree of
 * higher-order codecs without doing any encoding/decoding. In practice, this is
 * used by `getEntityVersions` to traverse the codecs and look at their metadata
 * to find the versions of the entities being encoded/decoded.
 *
 * This does mean that we need to implement wrappers for many of the basic
 * `io-ts` helpers (like t.union/t.array/etc.), but these wrappers are
 * straightforward to implement because they can mostly re-use the `io-ts`
 * helpers, adding an implementation for `encodeDiffWithState`.
 *
 * One awkward thing to note about this is that even though this allows us to
 * potentially make anything diffable, we should *not* diff inside non-primitive
 * attributes, because the backend only supports functional updates (i.e.
 * diffing) for associations/entities. In practice, this means that the only
 * things that have non-trivial diffing behavior are `EntityType` (for diffing
 * an entities fields) and `AssociationListType` (for diffing lists of entities).
 */
export default class ViewModelCodec<
  T,
  OutputT = T,
  DecodedT extends T = T,
> implements INamed {
  public name: string;
  public getChildCodecs: () => AnyCodec[];

  public is: (value: unknown) => value is T;
  public validateWithState: (
    input: unknown,
    context: ValidationContext,
    state: StateContainer,
  ) => Validation<DecodedT>;
  public encodeWithState: (
    value: T,
    state: StateContainer,
  ) => OutputT;
  /**
   * Returns a view model functional updates object that the backend can
   * understand.
   *
   * Returning undefined indicates that the value has not changed, so no diff
   * should be sent.
   */
  public encodeDiffWithState: (
    oldValue: T,
    newValue: T,
    state: StateContainer,
  ) => OutputT | undefined;

  public constructor({
    name,
    getChildCodecs,
    is,
    validateWithState,
    encodeWithState,
    encodeDiffWithState,
  }: ViewModelCodec<T, OutputT, DecodedT>) {
    this.name = name;
    this.getChildCodecs = getChildCodecs;
    this.is = is;
    this.validateWithState = validateWithState;
    this.encodeWithState = encodeWithState;
    this.encodeDiffWithState = encodeDiffWithState;
  }
}

// `any` must be used for the `T` type argument because that type is used in
// method arguments, meaning using `unknown` would cause type errors due to
// argument types being contravariant.
export type AnyCodec = ViewModelCodec<any, unknown, unknown>;

export type TypeOf<C extends AnyCodec> = C extends ViewModelCodec<infer T, any, any> ? T : never;
export type DecodedTypeOf<C extends AnyCodec> = C extends ViewModelCodec<any, any, infer T> ? T : never;
export type OutputTypeOf<C extends AnyCodec> = C extends ViewModelCodec<any, infer O, any> ? O : never;

export type ViewModelCodecClass<T extends AnyCodec> = abstract new (...args: any[]) => T;
export type TypeForClass<C extends ViewModelCodecClass<AnyCodec>> = (
  // Allow explicitly specifying the generic type of higher-order codec classes.
  // This is needed because when inferring the type via the class's type
  // argument constraints, `any` will be used in the type since the constraints
  // need to use `any` to avoid type errors due to method argument contravariance.
  //
  // This is needed for runtime reflection if you want to infer the type for a codec
  // class when associating metadata/behavior with a codec class.
  C extends { _typeForClass: infer T; } ? T : TypeOf<InstanceType<C>>
);

interface INamed {
  name: string;
}

/**
 * This interface is compatible with `io-ts`'s `ContextEntry` type, except that
 * `type` is only required to have a `name` and is not expected to be an `io-ts`
 * codec. In practice `io-ts` never uses `type`, so we can use this
 * interchangeably with `ContextEntry` (using type assertions).
 */
export interface IValidationContextEntry {
  readonly key: string;
  readonly type: INamed;
}
export type ValidationContext = readonly IValidationContextEntry[];
/**
 * The same as `io-ts`'s `ValidationError` interface, but with our looser
 * definition of `IValidationContextEntry`.
 */
export interface IValidationError {
  /** the offending (sub)value */
  readonly value: unknown;
  /** where the error originated */
  readonly context: ValidationContext;
  /** optional custom error message */
  readonly message?: string;
}
export type Errors = IValidationError[];
export type Validation<T> = Either<Errors, T>;
