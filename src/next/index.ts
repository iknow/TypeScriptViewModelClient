// Top level external API
export {
  default as ViewModelCodec,
  type TypeOf,
  type DecodedTypeOf,
  type OutputTypeOf,
  type ViewModelCodecClass,
  type TypeForClass,
  type AnyCodec,
} from './api/ViewModelCodec';
export { default as entityConstructor, isEntityConstructor } from './api/entityConstructor';
export { default as decodeResponse } from './api/decodeResponse';
export { default as encodeRequest } from './api/encodeRequest';
export { default as encodeDiffRequest } from './api/encodeDiffRequest';
export { default as getEntityVersions, type IVersionMap } from './api/getEntityVersions';
export { default as getEntityTypes } from './api/getEntityTypes';
export {
  default as Handle,
  DecodedHandle,
  DangerousHandle,
  type IdForConstructor,
  type DecodedIdForConstructor,
  type AnyHandle,
  type AnyDecodedHandle,
  type EntityForHandle,
  type DecodedEntityForHandle,
  isDecodedHandleOf,
  isHandleOf,
} from './api/Handle';
export { default as EntityDB, DecodedEntityDB, BaseEntityDB } from './api/EntityDB';
export { default as StateContainer, ImmutableStateContainer } from './api/StateContainer';

// Diffable codec types for defining entity fields with `entityConstructor()`
export * from './codecs/ioTs';
export { default as EntityType, PlainObjectEntityType, entity } from './codecs/EntityType';
export {
  default as HandleType,
  RefHandleType,
  EncodedRefHandleType,
  handle,
  refHandle,
  assertedRefHandle,
  encodedRefHandle,
} from './codecs/HandleType';
export {
  default as NestedType,
  nested,
} from './codecs/NestedType';
export { default as OptType, opt } from './codecs/OptType';
export { default as WriteOnlyType, writeOnly } from './codecs/WriteOnlyType';
export { default as ReadOnlyType, readOnly } from './codecs/ReadOnlyType';
export { default as WriteOnceType, writeOnce } from './codecs/WriteOnceType';
export { default as ListType, list } from './codecs/ListType';
export { default as AssociationListType, associationList } from './codecs/AssociationListType';
export { default as FromCodecsType, fromCodecs } from './codecs/FromCodecsType';
export { default as MappedType, mapped } from './codecs/MappedType';
export { default as LockVersionType, lockVersion } from './codecs/LockVersionType';
export { default as RefType, EncodedRefType, ref, encodedRef } from './codecs/RefType';
export { default as TrimmedType, trimmed } from './codecs/TrimmedType';
export { default as EmptyAsNullType, emptyAsNull } from './codecs/EmptyAsNullType';

// Other types and utils
export type {
  Entity,
  ReadonlyEntity,
  AnyEntity,
  AnyReadonlyEntity,
  DecodedEntity,
  ReadonlyDecodedEntity,
  AnyDecodedEntity,
  AnyReadonlyDecodedEntity,
  IEntityConstructor,
  IAnyEntityConstructor,
  IAnyEntityConstructorWithId,
} from './shared/Entity';
export {
  DecodeError,
} from './shared/decodeOrThrow';
export {
  default as ViewModelFields,
} from './shared/ViewModelFields';
export type { IReferences } from './codecs/RefType';
