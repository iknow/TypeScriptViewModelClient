import * as Immutable from 'immutable';
import ViewModelCodec from '../api/ViewModelCodec';
import Handle from '../api/Handle';
import ViewModelFields from '../shared/ViewModelFields';
import { IAnyEntityConstructor, AnyReadonlyEntity } from '../shared/Entity';
import { constructorAsFunc } from './ioTs';
import ListType, { list } from './ListType';

type HandleOrEntity = Handle<IAnyEntityConstructor, unknown> | AnyReadonlyEntity;

/**
 * EntryKey wraps a Handle or an Entity and implements `.equals`/`.hashCode` in
 * a consistent way so that the EntryKey can be used as a key in ImmutableJS
 * Maps/Sets in the same way regardless of whether the wrapped value is a Handle
 * or an Entity. This simplifies the logic for encoding diffs to association
 * lists because it can, for example, use a value in the new list to look up the
 * corresponding value (i.e. the value with the same type+ID) in the old list in
 * order to generate a diff of the items, without having to consider whether the
 * values are Handles or Entities.
 *
 * Similar to Handle, when the wrapped Handle/Entity has an `id` set to
 * `undefined`, it will use referential equality, treating each Handle/Entity as
 * a unique item in the list. Importantly, it uses the referential equality of
 * the wrapped Handle/Entity, not of the EntryKey object itself.
 *
 * There is an unsupported edge case with the special handling for `undefined`:
 * if the lists contain both a Handle and an Entity with their `id` set to
 * `undefined`, there is no way to know if they actually reference the same
 * logical entity, so they will always be considered as separate entities. In
 * practice, we never actually combine Handles and Entities in the same list, so
 * this shouldn't be a problem.
 */
class EntryKey extends Immutable.Record<{
  handleOrEntity: HandleOrEntity;
}>({ handleOrEntity: undefined as unknown as HandleOrEntity }) {
  public constructor(handleOrEntity: HandleOrEntity) {
    super({ handleOrEntity });
  }

  public equals(other: unknown): boolean {
    // Similar to the .equals implementation for Handle where it uses
    // referential equality when the `id` is undefined, but instead of using
    // referential equality of the `EntryKey` object, use referential equality of
    // the actual Handle or Entity object.
    if (!(other instanceof EntryKey)) return false;
    if (this.id === undefined) return this.handleOrEntity === other.handleOrEntity;
    return this.type === other.type && this.id === other.id;
  }

  // Override hashCode because the default implementation would probably
  // unnecessarily traverse everything in `handleOrEntity`.
  public hashCode(): number {
    return Immutable.hash(`${Immutable.hash(this.type)}:${String(this.id)}`);
  }

  public get type(): string {
    return this.handleOrEntity instanceof Handle ?
      this.handleOrEntity.type.typeName : this.handleOrEntity[ViewModelFields.Type];
  }

  public get id(): unknown {
    return this.handleOrEntity.id as unknown;
  }
}

export default class AssociationListType<
  T extends HandleOrEntity,
  DecodedT extends T,
>
extends ListType<
  ViewModelCodec<T, unknown, DecodedT>,
  Immutable.List<T>,
  ICollectionDiff | unknown[],
  Immutable.List<DecodedT>
> {
  public readonly type: ViewModelCodec<T, unknown, DecodedT>;

  public constructor(type: ViewModelCodec<T, unknown, DecodedT>) {
    super(list(type));
    this.name = `associationList(${type.name})`;
    this.type = type;

    this.encodeDiffWithState = (from, to, state) => {
      const fromValueEntries = from.map((value): [EntryKey, T] => [new EntryKey(value), value]);
      const toValueEntries = to.map((value): [EntryKey, T] => [new EntryKey(value), value]);
      const createMapAndAssertUnique = (entries: Immutable.List<[EntryKey, T]>) => {
        return Immutable.Map<EntryKey, T>().withMutations((map) => {
          for (const [key, value] of entries) {
            if (map.has(key)) {
              throw new Error(
                `Unexpected association list with multiple entries for entity with type ${key.type} and ID ${String(key.id)}`,
              );
            }
            map.set(key, value);
          }
        });
      };
      const fromValueMap = createMapAndAssertUnique(fromValueEntries);
      const toValueMap = createMapAndAssertUnique(toValueEntries);
      const fromValueKeys = fromValueEntries.map(([key]) => key);
      const toValueKeys = toValueEntries.map(([key]) => key);

      const commonEntries = longestCommonSubsequence(fromValueKeys, toValueKeys);

      if (commonEntries.isEmpty()) {
        // Nothing in common. Delete everything and append new.
        const actions: CollectionAction[] = [];
        if (!from.isEmpty()) {
          actions.push({
            [ViewModelFields.Type]: CollectionActionType.Remove,
            [ViewModelFields.Values]: fromValueKeys.map(encodeReference).toArray(),
          });
        }

        if (!to.isEmpty()) {
          const values = to.map(
            (value) => this.type.encodeWithState(value, state),
          ).toArray();

          actions.push({
            [ViewModelFields.Type]: CollectionActionType.Append,
            [ViewModelFields.Values]: values,
          });
        }

        return actions.length === 0 ? undefined : {
          [ViewModelFields.Type]: ViewModelFields.Update,
          [ViewModelFields.Actions]: actions,
        };
      }

      const commonEntrySet = commonEntries.toSet();

      const collectionActions: CollectionAction[] = [];
      const updatedEntries: unknown[] = [];

      // At least one fixed points. Generate a diff to preserve the user's intent.
      let after: EntryKey | undefined;
      let before: EntryKey | undefined = commonEntries.first();

      let worklist = toValueKeys;
      while (!worklist.isEmpty()) {
        const newEntryKey = worklist.first();
        if (newEntryKey && commonEntrySet.has(newEntryKey)) {
          // fixpoint, update state, maybe include edits

          const oldValue = getOrThrow(fromValueMap, newEntryKey);
          const newValue = getOrThrow(toValueMap, newEntryKey);
          const childUpdate = this.type.encodeDiffWithState(oldValue, newValue, state);
          if (childUpdate !== undefined) {
            updatedEntries.push(childUpdate);
          }

          after  = newEntryKey;
          before = undefined;

          worklist = worklist.rest();
        } else {
          // a run that needs to be inserted somewhere; collect the run
          // and give it a relative position
          const appendRunKeys = worklist.takeWhile(
            (key) => !(commonEntrySet.has(key)),
          );

          const values = appendRunKeys.map(
            (key) => this.type.encodeWithState(
              getOrThrow(toValueMap, key),
              state,
            ),
          ).toArray();
          const appendRunAction: IAppendAction = {
            [ViewModelFields.Type]: CollectionActionType.Append,
            [ViewModelFields.Values]: values,
          };

          if (after) {
            appendRunAction[ViewModelFields.After] = encodeReference(after);
          } else if (before) {
            appendRunAction[ViewModelFields.Before] = encodeReference(before);
          }
          collectionActions.push(appendRunAction);

          worklist = worklist.skip(appendRunKeys.size);
        }
      }

      const removedEntries = fromValueKeys.filter((key) => toValueKeys.indexOf(key) === -1);

      if (!removedEntries.isEmpty()) {
        collectionActions.push({
          [ViewModelFields.Type]: CollectionActionType.Remove,
          [ViewModelFields.Values]: removedEntries.map(encodeReference).toArray(),
        });
      }

      if (updatedEntries.length > 0) {
        collectionActions.push({
          [ViewModelFields.Type]: CollectionActionType.Update,
          [ViewModelFields.Values]: updatedEntries,
        });
      }

      return collectionActions.length === 0 ? undefined : {
        [ViewModelFields.Type]: ViewModelFields.Update,
        [ViewModelFields.Actions]: collectionActions,
      };
    };
  }
}

export const associationList = constructorAsFunc(AssociationListType);

interface ICollectionDiff {
  [ViewModelFields.Type]: typeof ViewModelFields.Update;
  [ViewModelFields.Actions]: CollectionAction[];
}

enum CollectionActionType {
  Append = 'append',
  Remove = 'remove',
  Update = 'update',
}

type CollectionAction = IRemoveAction | IUpdateAction | IAppendAction;

interface IRemoveAction {
  [ViewModelFields.Type]: CollectionActionType.Remove;
  [ViewModelFields.Values]: IViewModelReference[];
}

interface IUpdateAction {
  [ViewModelFields.Type]: CollectionActionType.Update;
  [ViewModelFields.Values]: unknown[];
}

interface IAppendAction {
  [ViewModelFields.Type]: CollectionActionType.Append;
  [ViewModelFields.Values]: unknown[];
  [ViewModelFields.After]?: IViewModelReference;
  [ViewModelFields.Before]?: IViewModelReference;
}

interface IViewModelReference {
  [ViewModelFields.Type]: string;
  [ViewModelFields.Id]: unknown;
}

function encodeReference(
  entry: EntryKey,
): IViewModelReference {
  return {
    [ViewModelFields.Type]: entry.type,
    [ViewModelFields.Id]: entry.id,
  };
}

function getOrThrow<K, V>(map: Immutable.Map<K, V>, key: K): V {
  const result = map.get(key);
  if (result === undefined) {
    // This should never happen in practice with how getOrThrow is being used
    throw new Error('Internal error');
  }
  return result;
}

function longest<T>(x: Immutable.List<T>, y: Immutable.List<T>) {
  return x.size > y.size ? x : y;
}

export function longestCommonSubsequence<T>(
  sequence1: Immutable.List<T>,
  sequence2: Immutable.List<T>,
  equal = Immutable.is,
): Immutable.List<T> {
  // Walk the m*n state space, keeping m*2 immutable chains in memory at
  // once. Use the smallest collection for m, and the larger for n, trading more
  // CPU for less memory.

  const xs = sequence1.size < sequence2.size ? sequence2 : sequence1; // longest
  const ys = sequence1.size < sequence2.size ? sequence1 : sequence2; // shortest

  let prev = new Array<Immutable.List<T>>(ys.size + 1);
  let curr = new Array<Immutable.List<T>>(ys.size + 1);

  for (let i = 0; i < prev.length; i++) {
    prev[i] = Immutable.List();
  }

  // xi and yi index into the string. Since the state space includes an entry
  // for having taken no characters, the location in the state space of the
  // string having handled x[xi] and y[yi] is at curr[yi+1].

  for (let xi = 0; xi < xs.size; xi++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const x = xs.get(xi)!;
    curr[0] = Immutable.List();
    for (let yi = 0; yi < ys.size; yi++) {
      curr[yi + 1] = equal(x, ys.get(yi))
        ? prev[yi].push(x) /* take both */
        : longest(curr[yi] /* skip y[yi] */,
        prev[yi + 1] /* skip x[xi] */);
    }

    const temp = prev;
    prev       = curr;
    curr       = temp;
  }

  return prev[ys.size];
}
