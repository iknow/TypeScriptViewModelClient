import * as t from 'io-ts';
import * as EitherFP from 'fp-ts/lib/Either';
import pick from 'lodash/pick';
import ViewModelCodec, {
  TypeOf,
  DecodedTypeOf,
  OutputTypeOf,
  Validation,
  Errors,
  AnyCodec,
} from '../api/ViewModelCodec';
import StateContainer from '../api/StateContainer';
import fromEntries from '../shared/fromEntries';
import collectionHasDiffs from '../shared/collectionHasDiffs';
import encodePrimitiveValueDiff from '../shared/encodePrimitiveValueDiff';

// Primitive codecs
// ----------------
export class NullType extends classFromIoTs(t.null) {}
const nullType = new NullType();
export { nullType as null };

export class UndefinedType extends classFromIoTs(t.undefined) {}
const undefinedType = new UndefinedType();
export { undefinedType as undefined };

export class VoidType extends classFromIoTs(t.void) {}
const voidType = new VoidType();
export { voidType as void };

export class StringType extends classFromIoTs(t.string) {}
export const string = new StringType();

export class NumberType extends classFromIoTs(t.number) {}
export const number = new NumberType();

export class BooleanType extends classFromIoTs(t.boolean) {}
export const boolean = new BooleanType();

export class UnknownType extends classFromIoTs(t.unknown) {}
export const unknown = new UnknownType();

export class UnknownArrayType extends classFromIoTs(t.UnknownArray) {}
export const UnknownArray = new UnknownArrayType();

export class UnknownDictionaryType extends classFromIoTs(t.UnknownRecord) {}
export const UnknownDictionary = new UnknownDictionaryType();
// Aliases for backwards compatibility with io-ts naming
/**
 * @deprecated Use `UnknownDictionaryType` instead.
 */
export const UnknownRecordType = UnknownDictionaryType;
/**
 * @deprecated Use `UnknownDictionary` instead.
 */
export const UnknownRecord = UnknownDictionary;

// Higher order codecs
// -------------------
export class LiteralType<V extends string | number | boolean> extends ViewModelCodec<V, V> {
  public value: V;

  public constructor(value: V) {
    super(fromIoTs(t.literal(value)));
    this.value = value;
  }
}

export const literal = constructorAsFunc(LiteralType);

// `AnyIoTsCodec` matches the types for `AnyCodec` by allowing an io-ts codec
// that represents `any`, but accepts `unknown` as input and produces `unknown`
// as output.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyIoTsCodec = t.Type<any, unknown, unknown>;

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface IFields {
  [key: PropertyKey]: AnyCodec;
}

// unknown & is used as a hack for controlling type display here
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
export type TypesForFields<F extends IFields> = unknown & { [K in keyof F]: TypeOf<F[K]> };
export type DecodedTypesForFields<F extends IFields> = unknown & { [K in keyof F]: DecodedTypeOf<F[K]> };
export type OutputTypesForFields<F extends IFields> = unknown & { [K in keyof F]: OutputTypeOf<F[K]> };
/* eslint-enable @typescript-eslint/no-redundant-type-constituents */

export class PartialType<F extends IFields> extends ViewModelCodec<
  Partial<TypesForFields<F>>,
  Partial<OutputTypesForFields<F>>,
  Partial<DecodedTypesForFields<F>>
> {
  public fields: F;
  public static _typeForClass: Record<string, unknown>;

  public constructor(fields: F) {
    const implementation = fromHigherOrderIoTsType<
      Partial<TypesForFields<F>>,
      Partial<OutputTypesForFields<F>>,
      Partial<DecodedTypesForFields<F>>
    >({
      makeIoTsType: (wrapCodec) => t.partial(fromEntries(Object.entries(fields).map(
        ([key, codec]) => [key, wrapCodec(codec)],
      )) as { [K in keyof F]: t.Type<TypeOf<F[K]>, OutputTypeOf<F[K]>, unknown> }),
      getChildCodecs: () => Object.values(fields),
    });

    const keys: Array<keyof F> = Object.keys(fields);

    super({
      ...implementation,
      encodeWithState: (value, state) => {
        // `t.partial`'s implementation copies all of the fields from the given
        // value, but we want to only include the known fields to avoid
        // including things like ImmutableJS private properties.
        const onlyKnownKeys = pick(value, keys);
        return implementation.encodeWithState(onlyKnownKeys, state);
      },
    });

    this.fields = fields;
  }
}

export const partial = constructorAsFunc(PartialType);

/**
 * Unlike the other codecs, `InterfaceType` is abstract so it can be extended
 * with an overridden `T` and `DecodedT`. This way both `EntityType` and
 * `NestedType` can subclasses of `InterfaceType`, for use with runtime
 * reflection.
 */
export abstract class InterfaceType<
  F extends IFields,
  T extends TypesForFields<F>,
  OutputT,
  DecodedT extends T,
> extends ViewModelCodec<T, OutputT, DecodedT> {
  public abstract fields: F;
  public static _typeForClass: Record<string, unknown>;
}

export class PlainObjectInterfaceType<F extends IFields>
extends InterfaceType<
  F,
  TypesForFields<F>,
  OutputTypesForFields<F>,
  DecodedTypesForFields<F>
> {
  public fields: F;

  public constructor(fields: F) {
    const implementation = fromHigherOrderIoTsType<
      TypesForFields<F>,
      OutputTypesForFields<F>,
      DecodedTypesForFields<F>
    >({
      makeIoTsType: (wrapCodec) => t.type(fromEntries(Object.entries(fields).map(
        ([key, codec]) => [key, wrapCodec(codec)],
      )) as { [K in keyof F]: t.Type<TypeOf<F[K]>, OutputTypeOf<F[K]>, unknown> }),
      getChildCodecs: () => Object.values(fields),
    });

    const keys: Array<keyof F> = Object.keys(fields);

    super({
      ...implementation,
      encodeWithState: (value, state) => {
        // `t.type`'s implementation copies all of the fields from the given
        // value, but we want to only include the known fields to avoid
        // including things like ImmutableJS private properties.
        const onlyKnownKeys = pick(value, keys);
        return implementation.encodeWithState(onlyKnownKeys, state);
      },
    });

    this.fields = fields;
  }
}

export const type = constructorAsFunc(PlainObjectInterfaceType);

export class ReadonlyInterfaceType<F extends IFields> extends InterfaceType<
  F,
  Readonly<TypesForFields<F>>,
  Readonly<OutputTypesForFields<F>>,
  Readonly<DecodedTypesForFields<F>>
> {
  public fields: F;
  public static _typeForClass: Readonly<Record<string, unknown>>;

  public constructor(fields: F) {
    super(new PlainObjectInterfaceType(fields));
    this.fields = fields;
  }
}

export const readonlyType = constructorAsFunc(ReadonlyInterfaceType);

export class ReadonlyArrayType<C extends AnyCodec> extends ViewModelCodec<
  ReadonlyArray<TypeOf<C>>,
  ReadonlyArray<OutputTypeOf<C>>,
  ReadonlyArray<DecodedTypeOf<C>>
> {
  public type: C;
  public static _typeForClass: readonly unknown[];

  public constructor(codec: C) {
    super({
      ...fromHigherOrderIoTsType({
        makeIoTsType: (wrapCodec) => t.readonlyArray(wrapCodec(codec)),
        getChildCodecs: () => [codec],
      }),

      encodeDiffWithState: (oldValue, newValue, state) => (
        (oldValue.length !== newValue.length || collectionHasDiffs(codec, oldValue, newValue, state)) ?
          this.encodeWithState(newValue, state) :
          undefined
      ),
    });

    this.type = codec;
  }
}

export const readonlyArray = constructorAsFunc(ReadonlyArrayType);

export class ArrayType<C extends AnyCodec> extends ViewModelCodec<
  Array<TypeOf<C>>,
  Array<OutputTypeOf<C>>,
  Array<DecodedTypeOf<C>>
> {
  public type: C;
  public static _typeForClass: unknown[];

  public constructor(codec: C) {
    super({
      ...fromHigherOrderIoTsType({
        makeIoTsType: (wrapCodec) => t.array(wrapCodec(codec)),
        getChildCodecs: () => [codec],
      }),

      encodeDiffWithState: (oldValue, newValue, state) => (
        (oldValue.length !== newValue.length || collectionHasDiffs(codec, oldValue, newValue, state)) ?
          this.encodeWithState(newValue, state) :
          undefined
      ),
    });

    this.type = codec;
  }
}

export const array = constructorAsFunc(ArrayType);

export class DictionaryType<
  DomainT extends PropertyKey,
  DomainOutputT extends PropertyKey,
  CodomainT,
  CodomainOutputF,
  CodomainDecodedT extends CodomainT,
>
extends ViewModelCodec<
  Record<DomainT, CodomainT>,
  Record<DomainOutputT, CodomainOutputF>,
  Record<DomainT, CodomainDecodedT>
> {
  // We must require the domain codec to use the same type for encoding and
  // decoding so that decoded type (`Record<DomainT, CodomainDecodedT>`)
  // extends the encodable type (`Record<DomainT, CodomainT>`).
  public domain: ViewModelCodec<DomainT, DomainOutputT, DomainT>;
  public codomain: ViewModelCodec<CodomainT, CodomainOutputF, CodomainDecodedT>;
  public static _typeForClass: Record<PropertyKey, unknown>;

  public constructor(
    domain: ViewModelCodec<DomainT, DomainOutputT, DomainT>,
    codomain: ViewModelCodec<CodomainT, CodomainOutputF, CodomainDecodedT>,
  ) {
    super(fromHigherOrderIoTsType({
      makeIoTsType: (wrapCodec) => t.record(wrapCodec(domain), wrapCodec(codomain)),
      getChildCodecs: () => [domain, codomain],
    }));

    this.domain = domain;
    this.codomain = codomain;
  }
}

export const dictionary = constructorAsFunc(DictionaryType);

// Aliases for backwards compatibility with io-ts naming
/**
 * @deprecated Use `DictionaryType` instead.
 */
export const RecordType = DictionaryType;
/**
 * @deprecated Use `dictionary` instead.
 */
export const record = dictionary;

export class UnionType<
  CS extends [AnyCodec, AnyCodec, ...AnyCodec[]],
> extends ViewModelCodec<
  TypeOf<CS[number]>,
  OutputTypeOf<CS[number]>,
  DecodedTypeOf<CS[number]>
> {
  public types: CS;
  public static _typeForClass: unknown;

  public constructor(types: CS) {
    super({
      ...fromHigherOrderIoTsType({
        makeIoTsType: (wrapCodec) => t.union(types.map(wrapCodec) as {
          [I in keyof CS]: I extends number ? t.Type<DecodedTypeOf<CS[I]>, OutputTypeOf<CS[I]>, unknown> : never;
        }),
        getChildCodecs: () => types,
      }),

      validateWithState: (input, context, state) => {
        let errors: Errors = [];
        for (let i = 0; i < types.length; i++) {
          const codec = types[i];
          // `union()` must create a separate mutable `StateContainer` for each
          // type that it attempts to decode, so that updates to the
          // `StateContainer` during failed attempts at decoding do not affect
          // the eventual successful attempt at decoding.
          //
          // For example, if while decoding `union([codecA, codecB])`, `codecA`
          // fails to decode but mutates something in `StateContainer`, and then
          // `codecB` succeeds, we don't want to keep the change the `codecA`
          // made to the state.
          const contextualState = new StateContainer(state.current);
          const result = codec.validateWithState(
            input,
            [...context, { key: String(i), type: codec }],
            contextualState,
          );
          if (EitherFP.isLeft(result)) {
            errors = [...errors, ...result.left];
          } else {
            // Once we have successfully decoded, we must apply any state
            // changes to the parent `StateContainer`.
            //
            // eslint-disable-next-line no-param-reassign
            state.current = contextualState.current;
            return result as Validation<DecodedTypeOf<CS[number]>>;
          }
        }
        return EitherFP.left(errors);
      },

      encodeDiffWithState: (oldValue, newValue, state): OutputTypeOf<CS[number]> | undefined => {
        for (const codec of this.types) {
          if (codec.is(oldValue) && codec.is(newValue)) {
            return codec.encodeDiffWithState(oldValue, newValue, state) as OutputTypeOf<CS[number]>;
          }
        }

        // If the values are not of the same type, then just encode the new value.
        return this.encodeWithState(newValue, state);
      },
    });

    this.types = types;
  }
}

export const union = constructorAsFunc(UnionType);

/**
 * Alias for `v.union([v.null, <codec>])`. Does not have a corresponding codec class.
 */
export const nullable = <C extends AnyCodec>(codec: C) => union([nullType, codec]);

type IntersectionTypeOf<
  CS extends [AnyCodec, AnyCodec, ...AnyCodec[]],
> = (
  CS extends { length: 2; } ? TypeOf<CS[0]> & TypeOf<CS[1]> :
  CS extends { length: 3; } ? TypeOf<CS[0]> & TypeOf<CS[1]> & TypeOf<CS[2]> :
  CS extends { length: 4; } ? TypeOf<CS[0]> & TypeOf<CS[1]> & TypeOf<CS[2]> & TypeOf<CS[3]> :
  CS extends { length: 5; } ? (
    TypeOf<CS[0]> & TypeOf<CS[1]> & TypeOf<CS[2]> & TypeOf<CS[3]> & TypeOf<CS[4]>
  ) :
  unknown
);
type IntersectionDecodedTypeOf<
  CS extends [AnyCodec, AnyCodec, ...AnyCodec[]],
> = (
  CS extends { length: 2; } ? DecodedTypeOf<CS[0]> & DecodedTypeOf<CS[1]> :
  CS extends { length: 3; } ? DecodedTypeOf<CS[0]> & DecodedTypeOf<CS[1]> & DecodedTypeOf<CS[2]> :
  CS extends { length: 4; } ? (
    DecodedTypeOf<CS[0]> & DecodedTypeOf<CS[1]> & DecodedTypeOf<CS[2]> & DecodedTypeOf<CS[3]>
  ) :
  CS extends { length: 5; } ? (
    DecodedTypeOf<CS[0]> & DecodedTypeOf<CS[1]> & DecodedTypeOf<CS[2]> & DecodedTypeOf<CS[3]> & DecodedTypeOf<CS[4]>
  ) :
  unknown
);
type IntersectionOutputTypeOf<
  CS extends [AnyCodec, AnyCodec, ...AnyCodec[]],
> = (
  CS extends { length: 2; } ? OutputTypeOf<CS[0]> & OutputTypeOf<CS[1]> :
  CS extends { length: 3; } ? OutputTypeOf<CS[0]> & OutputTypeOf<CS[1]> & OutputTypeOf<CS[2]> :
  CS extends { length: 4; } ? OutputTypeOf<CS[0]> & OutputTypeOf<CS[1]> & OutputTypeOf<CS[2]> & OutputTypeOf<CS[3]> :
  CS extends { length: 5; } ? (
    OutputTypeOf<CS[0]> & OutputTypeOf<CS[1]> & OutputTypeOf<CS[2]> & OutputTypeOf<CS[3]> & OutputTypeOf<CS[4]>
  ) :
  unknown
);

export class IntersectionType<
  CS extends [AnyCodec, AnyCodec, ...AnyCodec[]],
> extends ViewModelCodec<
  IntersectionTypeOf<CS>,
  IntersectionOutputTypeOf<CS>,
  IntersectionDecodedTypeOf<CS>
> {
  public types: CS;
  public static _typeForClass: unknown;

  public constructor(types: CS) {
    // The io-ts types expect a tuple with a fixed length as the argument, so we have to fake it.
    type FakeIntersectionType = [
      t.Type<TypeOf<CS[0]>, OutputTypeOf<CS[0]>>,
      t.Type<TypeOf<CS[1]>, OutputTypeOf<CS[1]>>,
    ];

    super(fromHigherOrderIoTsType({
      makeIoTsType: (wrapCodec) => t.intersection(
        types.map(wrapCodec) as FakeIntersectionType,
        // Because we had to pass an incorrect type to satisfy the argument
        // types, we need to use another assertion to fix the output type.
      ) as t.Type<IntersectionTypeOf<CS>, IntersectionOutputTypeOf<CS>>,
      getChildCodecs: () => types,
    }));

    this.types = types;
  }
}

export const intersection = constructorAsFunc(IntersectionType);

type TupleTypeOf<CS extends [AnyCodec, ...AnyCodec[]]> = (
  CS extends { length: 1; } ? [TypeOf<CS[0]>] :
  CS extends { length: 2; } ? [TypeOf<CS[0]>, TypeOf<CS[1]>] :
  CS extends { length: 3; } ? [TypeOf<CS[0]>, TypeOf<CS[1]>, TypeOf<CS[2]>] :
  CS extends { length: 4; } ? [TypeOf<CS[0]>, TypeOf<CS[1]>, TypeOf<CS[2]>, TypeOf<CS[3]>] :
  CS extends { length: 5; } ? [
    TypeOf<CS[0]>, TypeOf<CS[1]>, TypeOf<CS[2]>, TypeOf<CS[3]>, TypeOf<CS[4]>,
  ] :
  unknown
);
type TupleDecodedTypeOf<CS extends [AnyCodec, ...AnyCodec[]]> = (
  CS extends { length: 1; } ? [DecodedTypeOf<CS[0]>] :
  CS extends { length: 2; } ? [DecodedTypeOf<CS[0]>, DecodedTypeOf<CS[1]>] :
  CS extends { length: 3; } ? [DecodedTypeOf<CS[0]>, DecodedTypeOf<CS[1]>, DecodedTypeOf<CS[2]>] :
  CS extends { length: 4; } ? [DecodedTypeOf<CS[0]>, DecodedTypeOf<CS[1]>, DecodedTypeOf<CS[2]>, DecodedTypeOf<CS[3]>] :
  CS extends { length: 5; } ? [
    DecodedTypeOf<CS[0]>, DecodedTypeOf<CS[1]>, DecodedTypeOf<CS[2]>, DecodedTypeOf<CS[3]>, DecodedTypeOf<CS[4]>,
  ] :
  unknown
);
type TupleOutputTypeOf<CS extends [AnyCodec, ...AnyCodec[]]> = (
  CS extends { length: 1; } ? [OutputTypeOf<CS[0]>] :
  CS extends { length: 2; } ? [OutputTypeOf<CS[0]>, OutputTypeOf<CS[1]>] :
  CS extends { length: 3; } ? [OutputTypeOf<CS[0]>, OutputTypeOf<CS[1]>, OutputTypeOf<CS[2]>] :
  CS extends { length: 4; } ? [OutputTypeOf<CS[0]>, OutputTypeOf<CS[1]>, OutputTypeOf<CS[2]>, OutputTypeOf<CS[3]>] :
  CS extends { length: 5; } ? [
    OutputTypeOf<CS[0]>, OutputTypeOf<CS[1]>, OutputTypeOf<CS[2]>, OutputTypeOf<CS[3]>, OutputTypeOf<CS[4]>,
  ] :
  unknown
);
export class TupleType<CS extends [AnyCodec, ...AnyCodec[]]>
extends ViewModelCodec<
  TupleTypeOf<CS>,
  TupleOutputTypeOf<CS>,
  TupleDecodedTypeOf<CS>
> {
  public types: CS;
  public static _typeForClass: unknown[];

  public constructor(types: CS) {
    // The io-ts types expect a tuple with a fixed length as the argument, so we have to fake it.
    type FakeTupleType = [t.Type<TypeOf<CS[0]>, OutputTypeOf<CS[0]>>];

    super(fromHigherOrderIoTsType({
      makeIoTsType: (wrapCodec) => t.tuple(
        types.map((childType) => wrapCodec(childType)) as FakeTupleType,
        // Because we had to pass an incorrect type to satisfy the argument
        // types, we need to use another assertion to fix the output type.
      ) as unknown as t.Type<TupleTypeOf<CS>, TupleOutputTypeOf<CS>, unknown>,
      getChildCodecs: () => types,
    }));

    this.types = types;
  }
}

export const tuple = constructorAsFunc(TupleType);

export class KeyOfType<D extends Record<string, unknown>> extends ViewModelCodec<keyof D, keyof D> {
  public keys: D;

  public constructor(keys: D) {
    super(fromIoTs(t.keyof(keys)));

    this.keys = keys;
  }
}

export const keyof = constructorAsFunc(KeyOfType);

// This type was simpler to implement directly than to use the io-ts implementation.
export class LazyType<C extends AnyCodec>
extends ViewModelCodec<TypeOf<C>, OutputTypeOf<C>, DecodedTypeOf<C>> {
  public static _typeForClass: unknown;
  private cache: C | undefined;
  private getType: () => C;

  public constructor(name: string, getType: () => C) {
    super({
      name,
      getChildCodecs: () => [this.type],
      is: (value): value is TypeOf<C> => this.type.is(value),
      validateWithState: (input, context, state): Validation<DecodedTypeOf<C>> =>
        this.type.validateWithState(input, context, state) as Validation<DecodedTypeOf<C>>,
      encodeWithState: (value, state): OutputTypeOf<C> =>
        this.type.encodeWithState(value, state) as OutputTypeOf<C>,
      encodeDiffWithState: (oldValue, newValue, state): OutputTypeOf<C> | undefined =>
        this.type.encodeDiffWithState(oldValue, newValue, state) as (OutputTypeOf<C> | undefined),
    });

    this.getType = getType;
  }

  public get type(): C {
    if (this.cache) {
      return this.cache;
    } else {
      const lazyType = this.getType();
      this.cache = lazyType;
      return lazyType;
    }
  }
}

export const lazy = constructorAsFunc(LazyType);

export type { Brand } from 'io-ts';

export class BrandType<
  C extends AnyCodec,
  N extends string,
  B extends Readonly<Record<N, symbol>>,
> extends ViewModelCodec<TypeOf<C> & t.Brand<B>, OutputTypeOf<C>, DecodedTypeOf<C> & t.Brand<B>> {
  public static _typeForClass: unknown;

  public constructor(
    codec: C,
    predicate: (value: TypeOf<C>) => value is (TypeOf<C> & t.Brand<B>),
    name: N,
  ) {
    super(fromHigherOrderIoTsType({
      makeIoTsType: (wrapCodec) => t.brand(wrapCodec(codec), predicate, name),
      getChildCodecs: () => [codec],
    }));
  }
}

export const brand = constructorAsFunc(BrandType);

export class RefinementType<C extends AnyCodec>
extends ViewModelCodec<TypeOf<C>, OutputTypeOf<C>, DecodedTypeOf<C>> {
  public static _typeForClass: unknown;

  public constructor(
    codec: C,
    predicate: (value: TypeOf<C>) => boolean,
    name?: string,
  ) {
    super(fromHigherOrderIoTsType({
      makeIoTsType: (wrapCodec) => t.refinement(wrapCodec(codec), predicate, name),
      getChildCodecs: () => [codec],
    }));
  }
}

export const refinement = constructorAsFunc(RefinementType);

// Utils
// -----
/**
 * Converts an `io-ts` codec to a `ViewModelCodec`.
 */
export function fromIoTs<C extends AnyIoTsCodec>(codec: C): ViewModelCodec<t.TypeOf<C>, t.OutputOf<C>> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return new ViewModelCodec({
    name: codec.name,
    getChildCodecs: () => [],
    is: (value): value is t.TypeOf<C> => codec.is(value),
    validateWithState: (input, context) => codec.validate(
      input,
      // Type assertion needed because the `io-ts` expects
      // `IValidationContextEntry['type']` to be an `io-ts` codec. In
      // practice, `io-ts` never accesses the `type`, so this is safe.
      context as t.Context,
    ),
    encodeWithState: (value) => codec.encode(value),
    encodeDiffWithState(oldValue, newValue, state) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return encodePrimitiveValueDiff(this, oldValue, newValue, state);
    },
  });
}

export function fromHigherOrderIoTsType<T, OutputT, DecodedT extends T>({
  makeIoTsType,
  getChildCodecs,
}: {
  makeIoTsType: (
    wrapCodec: <C extends AnyCodec>(codec: C) => t.Type<
      TypeOf<C>,
      OutputTypeOf<C>,
      unknown
    >,
  ) => t.Type<T, OutputT, unknown>;
  getChildCodecs: () => AnyCodec[];
}): ViewModelCodec<T, OutputT, DecodedT> {
  // This variable gives the `io-ts` codec access to the state required by view
  // model codecs. `io-ts` codecs are not called with the state parameter, so it
  // must be injected into their handlers using this dynamically scoped variable
  let dynamicallyScopedState: StateContainer | undefined;

  const ioTsType = makeIoTsType((codec) => new t.Type(
    codec.name,
    function is(value): value is TypeOf<typeof codec> {
      return codec.is(value);
    },
    function validate(childInput, ioTsContext) {
      if (dynamicallyScopedState === undefined) {
        throw new Error('Internal error: dynamicallyScopedState not set');
      }
      return codec.validateWithState(
        childInput,
        ioTsContext,
        dynamicallyScopedState,
        // Type assertion needed because the `io-ts` expects
        // `IValidationContextEntry['type']` to be an `io-ts` codec. In
        // practice, `io-ts` never accesses the `type`, so this is safe.
      ) as t.Validation<DecodedTypeOf<typeof codec>>;
    },
    function encode(childValue): OutputTypeOf<typeof codec> {
      if (dynamicallyScopedState === undefined) {
        throw new Error('Internal error: dynamicallyScopedState not set');
      }
      return codec.encodeWithState(childValue, dynamicallyScopedState) as OutputTypeOf<typeof codec>;
    },
  ));

  return new ViewModelCodec<T, OutputT, DecodedT>({
    name: ioTsType.name,
    getChildCodecs,
    is: (value): value is T => ioTsType.is(value),
    validateWithState: (input, context, state) => {
      dynamicallyScopedState = state;
      const validation = ioTsType.validate(
        input,
        // Type assertion needed because the `io-ts` expects
        // `IValidationContextEntry['type']` to be an `io-ts` codec. In
        // practice, `io-ts` never accesses the `type`, so this is safe.
        context as t.Context,
      );
      dynamicallyScopedState = undefined;

      // Type assertion needed because the `io-ts` expects
      // `IValidationContextEntry['type']` to be an `io-ts` codec. In
      // practice, `io-ts` never accesses the `type`, so this is safe.
      return validation as Validation<DecodedT>;
    },
    encodeWithState: (value, state) => {
      dynamicallyScopedState = state;
      const result = ioTsType.encode(value);
      dynamicallyScopedState = undefined;

      return result;
    },
    encodeDiffWithState(oldValue, newValue, state) {
      return encodePrimitiveValueDiff(this, oldValue, newValue, state);
    },
  });
}

export function classFromIoTs<C extends AnyIoTsCodec>(ioTsCodec: C) {
  const codec = fromIoTs(ioTsCodec);

  return class implements ViewModelCodec<t.TypeOf<C>, t.OutputOf<C>> {
    public name = codec.name;

    public is = codec.is;
    public validateWithState = codec.validateWithState;
    public encodeWithState = codec.encodeWithState;
    public encodeDiffWithState = codec.encodeDiffWithState;
    public getChildCodecs = () => [];
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function constructorAsFunc<A extends any[], C extends AnyCodec>(
  codecClass: new (...args: A) => C,
) {
  return (...args: A): C => new codecClass(...args);
}
