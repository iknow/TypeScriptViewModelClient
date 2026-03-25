import { TypeOf, AnyCodec } from '../api/ViewModelCodec';
import StateContainer from '../api/StateContainer';

/**
 * Checks if an arbitrary iterable collection has diffs by iterating over its
 * items and calling `encodeDiffWithState` on each of the items. Can be used to
 * implement `encodeDiffWithState` for higher order codecs.
 */
export default function collectionHasDiffs<C extends AnyCodec>(
  itemCodec: C,
  oldItemIterable: Iterable<TypeOf<C>>,
  newItemIterable: Iterable<TypeOf<C>>,
  state: StateContainer,
): boolean {
  const oldItemIterator = oldItemIterable[Symbol.iterator]();
  const newItemIterator = newItemIterable[Symbol.iterator]();

  let oldResult = oldItemIterator.next();
  let newResult = newItemIterator.next();
  while (!oldResult.done && !newResult.done) {
    if (itemCodec.encodeDiffWithState(oldResult.value, newResult.value, state) !== undefined) {
      return true;
    }
    oldResult = oldItemIterator.next();
    newResult = newItemIterator.next();
  }

  return !oldResult.done || !newResult.done;
}
