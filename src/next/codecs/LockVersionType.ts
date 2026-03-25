import ViewModelCodec from '../api/ViewModelCodec';
import StateContainer from '../api/StateContainer';
import * as v from './ioTs';

export const encodeLockVersionKey = StateContainer.createKey(true);

export default class LockVersionType extends ViewModelCodec<number, number | undefined> {
  public constructor() {
    super(v.number);

    this.encodeWithState = (value, state) => {
      if (!state.get(encodeLockVersionKey)) {
        return undefined;
      }

      return value;
    };

    this.encodeDiffWithState = (oldValue, newValue, state) => {
      if (!state.get(encodeLockVersionKey)) {
        return undefined;
      }

      return newValue;
    };
  }
}

/**
 * Equivalent to `v.number`, but using `v.lockVersion` allows you to disable
 * sending all lock versions via the `encodeLockVersion` argument to
 * `encodeRequest`/`encodeDiffRequest`.
 */
export const lockVersion = new LockVersionType();
