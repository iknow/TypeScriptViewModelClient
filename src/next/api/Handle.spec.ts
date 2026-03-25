import { expect } from 'chai';
import * as Hojicha from '@engoo/hojicha';
import * as v from '../index';

class TestEntity extends v.entityConstructor({
  typeName: 'TestEntity',
  version: 1,
  fields: {
    id: v.opt(v.string),
  },
}) {}

Hojicha.describe(v.Handle.name, function () {
  this.it('is true when handles are undefined but have same reference', function () {
    const handle1 = v.Handle.dangerouslyCreateFromTypeAndId(TestEntity, undefined);
    expect(handle1.equals(handle1)).to.equal(true);
  });

  this.it('is false when handles are undefined and do not have same reference', function () {
    const handle1 = v.Handle.dangerouslyCreateFromTypeAndId(TestEntity, undefined);
    const handle2 = v.Handle.dangerouslyCreateFromTypeAndId(TestEntity, undefined);
    expect(handle1.equals(handle2)).to.equal(false);
  });
});
