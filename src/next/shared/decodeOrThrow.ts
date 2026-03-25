import { isLeft } from 'fp-ts/lib/Either';
import {
  IValidationError,
  DecodedTypeOf,
  AnyCodec,
} from '../api/ViewModelCodec';
import StateContainer from '../api/StateContainer';

export class DecodeError extends Error {
  public name = 'DecodeError';
}

export default function decodeOrThrow<C extends AnyCodec>(
  codec: C,
  input: unknown,
  state: StateContainer,
): DecodedTypeOf<C> {
  const initialContext = [{ key: '', type: codec }];
  const resultEither = codec.validateWithState(input, initialContext, state);
  if (isLeft(resultEither)) {
    const errors = resultEither.left;
    throw new DecodeError(`Error(s) when parsing ${codec.name}:\n${errors.map(parseError).join('\n')}`);
  }
  return resultEither.right as DecodedTypeOf<C>;
}

export function parseError(error: IValidationError): string {
  const path = error.context.map((c, index) => {
    if (index === 0) {
      // the first context is the parent type so the key is always "". In that
      // case we just display the type name instead.
      return c.type.name;
    } else {
      return c.key;
    }
  }).join('/');
  const message = error.message ?? `Invalid value: ${JSON.stringify(error.value)}`;
  const type = error.context[error.context.length - 1].type.name;
  return `${path}: ${type} - ${message}`;
}
