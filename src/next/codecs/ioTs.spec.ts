import * as iots from 'io-ts';
import { fromIoTs } from './ioTs';

describe('fromIoTs', () => {
  it('gives type error when passing an io-ts codec that does not accept unknown as input', () => {
    type TestString = 'test';
    const TestCodec = new iots.Type<TestString, TestString, string>(
      'TestCodec',
      (input): input is TestString => input === 'test',
      (input, context) => {
        if (input !== 'test') {
          iots.failure(input, context, 'Expected "test" string');
        }
        return iots.success(input as 'test');
      },
      (value) => value,
    );
    // @ts-expect-error the codec must accept unknown as input
    fromIoTs(TestCodec);
  });

  it('accepts io-ts codec that accept unknown as input', () => {
    type TestString = 'test';
    const TestCodec = new iots.Type<TestString, TestString, unknown>(
      'TestCodec',
      (input): input is TestString => input === 'test',
      (input, context) => {
        if (input !== 'test') {
          iots.failure(input, context, 'Expected "test" string');
        }
        return iots.success(input as 'test');
      },
      (value) => value,
    );
    fromIoTs(TestCodec);
  });
});
