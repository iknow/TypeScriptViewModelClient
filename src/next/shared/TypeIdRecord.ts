import * as Immutable from 'immutable';

export default class TypeIdRecord extends Immutable.Record<{
  type: string;
  id: unknown;
}>({ type: '', id: '' }) {}
