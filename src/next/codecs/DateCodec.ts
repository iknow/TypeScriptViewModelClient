import * as EitherFP from 'fp-ts/lib/Either';
import * as v from '../index';

/**
 * @private
 *
 * Used internally for tests
 */
const DateCodec = new v.ViewModelCodec<Date, string>({
  name: 'Date',
  getChildCodecs: () => [],
  is: (value): value is Date => value instanceof Date,
  validateWithState: (input, context, state) => {
    const stringEither = v.string.validateWithState(input, context, state);
    if (EitherFP.isLeft(stringEither)) {
      return stringEither;
    }

    const date = new Date(stringEither.right);
    if (Number.isNaN(date.valueOf())) {
      return EitherFP.left([{
        value: stringEither.right,
        context,
        message: 'Invalid date string',
      }]);
    } else {
      return EitherFP.right(date);
    }
  },
  encodeWithState: (value) => value.toJSON(),
  encodeDiffWithState: (fromValue, toValue) => (
    fromValue.valueOf() === toValue.valueOf() ? undefined : toValue.toJSON()
  ),
});

export default DateCodec;
