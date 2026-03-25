import { isLeft, right } from 'fp-ts/lib/Either';
import fromEntries from '../shared/fromEntries';
import encodePrimitiveValueDiff from '../shared/encodePrimitiveValueDiff';
import * as v from './ioTs';

export default class KeyMappingInterfaceType<F extends v.IFields>
extends v.InterfaceType<
  F,
  v.TypesForFields<F>,
  Record<string, unknown>,
  v.DecodedTypesForFields<F>
> {
  public fields: F;
  public encodedKeysToKeys: Record<string, keyof F>;

  public constructor(fields: F, getEncodedKey: (key: string) => string) {
    const interfaceType = v.type(fields);
    const encodedInterfaceType = v.type(mapKeys(fields, getEncodedKey));
    super({
      name: 'KeyMappingInterfaceType',
      getChildCodecs: () => Object.values(this.fields),
      is: interfaceType.is,
      validateWithState: (input, context, state) => {
        const result = encodedInterfaceType.validateWithState(input, context, state);
        if (isLeft(result)) {
          return result;
        }

        const values = fromEntries(Object.keys(fields).map(
          (key) => [key, result.right[getEncodedKey(key)]],
        )) as v.DecodedTypesForFields<F>;
        return right(values);
      },
      encodeWithState: (values, state) => {
        const result = interfaceType.encodeWithState(values, state);
        return mapKeys(result, getEncodedKey);
      },
      encodeDiffWithState(oldValues, newValues, state) {
        return encodePrimitiveValueDiff(this, oldValues, newValues, state);
      },
    });

    this.fields = fields;
    this.encodedKeysToKeys = fromEntries(
      Object.keys(fields).map((key) => [getEncodedKey(key), key]),
    );
  }
}

function mapKeys<T extends Record<string, unknown>>(
  obj: T,
  keyMapper: (key: string) => string,
): Record<string, T[keyof T]> {
  const result: Record<string, T[keyof T]> = {};
  // Use for-in loop because `Object.keys()` returns `string` instead of `keyof T`
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      result[keyMapper(key)] = obj[key];
    }
  }
  return result;
}
