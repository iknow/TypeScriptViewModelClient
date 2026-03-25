import { AnyCodec } from '../api/ViewModelCodec';
import EntityType from '../codecs/EntityType';
import * as v from '../codecs/ioTs';
import ViewModelFields from '../shared/ViewModelFields';

type UnknownEntityType = EntityType<
  v.IFields,
  Record<string, unknown> & { [ViewModelFields.Type]: string; },
  Record<string, unknown> & { [ViewModelFields.Type]: string; },
  string
>;

/**
 * Given an arbitrary `ViewModelCodec`, it traverses the tree of types that the
 * codec represents and finds any `EntityType` codecs within the tree, returning
 * an array of `EntityType`s.
 *
 * It will log a warning if it finds a codec that it doesn't know how to
 * traverse. To tell `getEntityTypes()` how to traverse the codec, add a
 * `.childTypes` property to the codec containing an array of all codecs
 * contained within it if it is a higher order codec, or an empty array if it's
 * not a higher order codec.
 */
export default function getEntityTypes(rootType: AnyCodec): UnknownEntityType[] {
  const entityTypes: UnknownEntityType[] = [];
  const walkedCodecs = new Set<AnyCodec>();

  const walk = (codec: AnyCodec): void => {
    if (walkedCodecs.has(codec)) {
      // Avoid infinite loop for recursive types.
      return;
    }

    walkedCodecs.add(codec);

    if (codec instanceof EntityType) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      entityTypes.push(codec);
    }

    const childCodecs = codec.getChildCodecs();

    for (const childCodec of childCodecs) {
      walk(childCodec);
    }
  };

  walk(rootType);

  return entityTypes;
}
