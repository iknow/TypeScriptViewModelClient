import { isLeft, right } from 'fp-ts/lib/Either';
import * as v from '../codecs/ioTs';
import {
  IAnyEntityConstructor,
  ReadonlyEntity,
  DecodedEntity,
} from '../shared/Entity';
import EntityType from './EntityType';

export default class NestedType<C extends IAnyEntityConstructor> extends EntityType<
  C['fields'],
  ReadonlyEntity<C>,
  DecodedEntity<C>,
  C['typeName']
> {
  public constructor(entityConstructor: C) {
    super({
      typeName: entityConstructor.typeName,
      fields: entityConstructor.fields,
      version: entityConstructor.version,
      noDiffFields: entityConstructor.noDiffFields,
    });

    this.is = (value: unknown): value is ReadonlyEntity<C> => (
      value instanceof entityConstructor
    );

    const parentValidate = this.validateWithState;
    this.validateWithState = (input, context, state) => {
      const result = parentValidate(input, context, state);
      if (isLeft(result)) {
        return result;
      }

      return right(entityConstructor.decodedEntity(result.right));
    };
  }
}

export const nested = v.constructorAsFunc(NestedType);
