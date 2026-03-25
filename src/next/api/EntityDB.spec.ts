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
type DecodedTestEntity = v.DecodedEntity<typeof TestEntity>;

class TestEntity2 extends v.entityConstructor({
  typeName: 'TestEntity2',
  version: 1,
  fields: {
    id: v.string,
  },
}) {}
type DecodedTestEntity2 = v.DecodedEntity<typeof TestEntity2>;


class EntityWithValue extends v.entityConstructor({
  typeName: 'EntityWithValue',
  version: 1,
  fields: {
    id: v.opt(v.string),
    value: v.string,
  },
}) {}

Hojicha.describe(v.DecodedHandle.name, function () {
  // The behavior of `DecodedHandle` is the same for both `EntityDB` and
  // `DecodedEntityDB`, so these tests only use `EntityDB`.

  const decodedEntity = EntityWithValue.decodedEntity({ id: 'test', value: 'decoded value' });
  const decodedHandle = new v.DecodedHandle(EntityWithValue, decodedEntity);
  const updatedDb = v.EntityDB.emptyDb.set(decodedHandle, decodedEntity.set('value', 'updated value'));

  this.it('prefers value in EntityDB with .get', function () {
    expect(updatedDb.get(decodedHandle).value).to.equal('updated value');
  });

  this.it('prefers value in EntityDB with .resolve', function () {
    expect(decodedHandle.resolve(updatedDb).value).to.equal('updated value');
  });

  this.it('falls back to value in DecodedHandle with .get', function () {
    expect(v.EntityDB.emptyDb.get(decodedHandle).value).to.equal('decoded value');
  });

  this.it('falls back to value in DecodedHandle with .resolve', function () {
    expect(decodedHandle.resolve(v.EntityDB.emptyDb).value).to.equal('decoded value');
  });

  this.it('.has() still returns false even if passed a DecodedHandle', function () {
    expect(v.EntityDB.emptyDb.has(decodedHandle)).to.equal(false);
  });

  this.it('.update() prefers value in EntityDB', function () {
    const db = updatedDb.update(decodedHandle, (e) => e.update('value', (value) => `${value} + update`));
    expect(db.get(decodedHandle).value).to.equal('updated value + update');
  });

  this.it('.update() falls back to value in DecodedHandle', function () {
    const db = v.EntityDB.emptyDb.update(decodedHandle, (e) => e.update('value', (value) => `${value} + update`));
    expect(db.get(decodedHandle).value).to.equal('decoded value + update');
  });
});

Hojicha.describe(v.EntityDB.name, function () {
  // ----- Start tests common to EntityDB and DecodedEntityDB -----
  this.it('can set entity using handle and entity', function () {
    let db = v.EntityDB.emptyDb;
    const entity = new TestEntity({ id: 'test' });
    const handle = new v.Handle(TestEntity, entity);
    db = db.set(handle, entity);
    db.get(handle);
  });

  this.it('can set entity using only entity', function () {
    let db = v.EntityDB.emptyDb;
    const entity = new TestEntity({ id: 'test' });
    const handle = new v.Handle(TestEntity, entity);
    db = db.setEntity(entity);
    db.get(handle);
  });

  this.it('has proper return type when passing a union of handles', function () {
    // This test case is only intended to test the types, not the runtime behavior.
    const entity = new TestEntity({ id: 'test' });
    const db = v.EntityDB.emptyDb.setEntity(entity);
    const handle = new v.Handle(TestEntity, entity) as (
      v.Handle<typeof TestEntity> | v.Handle<typeof TestEntity2>
    );

    const result: TestEntity | TestEntity2 = db.get(handle);
    expect(result).to.equal(entity);

    db.set(handle, entity as (TestEntity | TestEntity2));

    db.update(handle, (_prevValue: TestEntity | TestEntity2) => undefined);
  });

  this.it('throws when passing a DangerousHandle to .get() with no entry', function () {
    expect(
      () => v.EntityDB.emptyDb.get(v.Handle.dangerouslyCreateFromTypeAndId(TestEntity, 'test')),
    ).to.throw(/Could not find entity/);
  });
  // ----- End tests common to EntityDB and DecodedEntityDB -----

  this.it('allows independent handles if ID is undefined', function () {
    let db = v.EntityDB.emptyDb;
    const entity1 = new EntityWithValue({ id: undefined, value: 'value 1' });
    const handle1 = new v.Handle(EntityWithValue, entity1);
    const entity2 = new EntityWithValue({ id: undefined, value: 'value 2' });
    const handle2 = new v.Handle(EntityWithValue, entity2);
    db = db.set(handle1, entity1);
    db = db.set(handle2, entity2);
    expect(db.get(handle1).value).to.equal('value 1');
    expect(db.get(handle2).value).to.equal('value 2');
  });
});

Hojicha.describe(v.DecodedEntityDB.name, function () {
  // ----- Start tests common to EntityDB and DecodedEntityDB -----
  this.it('can set entity using handle and entity', function () {
    let db = v.DecodedEntityDB.emptyDb;
    const entity = TestEntity.decodedEntity({ id: 'test' });
    const handle = new v.DecodedHandle(TestEntity, entity);
    db = db.set(handle, entity);
    db.get(handle);
  });

  this.it('can set entity using only entity', function () {
    let db = v.DecodedEntityDB.emptyDb;
    const entity = TestEntity.decodedEntity({ id: 'test' });
    const handle = new v.DecodedHandle(TestEntity, entity);
    db = db.setEntity(entity);
    db.get(handle);
  });

  this.it('has proper return type when passing a union of handles', function () {
    // This test case is only intended to test the types, not the runtime behavior.
    const entity = TestEntity.decodedEntity({ id: 'test' });
    const db = v.DecodedEntityDB.emptyDb.setEntity(entity);
    const handle = new v.Handle(TestEntity, entity) as (
      v.Handle<typeof TestEntity> | v.Handle<typeof TestEntity2>
    );
    const decodedHandle = new v.DecodedHandle(TestEntity, entity) as (
      v.DecodedHandle<typeof TestEntity> | v.DecodedHandle<typeof TestEntity2>
    );

    const result1: DecodedTestEntity | DecodedTestEntity2 | undefined = db.get(handle);
    expect(result1).to.equal(entity);

    const result2: DecodedTestEntity | DecodedTestEntity2 = db.get(decodedHandle);
    expect(result2).to.equal(entity);

    db.set(handle, entity as (DecodedTestEntity | DecodedTestEntity2));

    db.update(handle, (_prevValue: DecodedTestEntity | DecodedTestEntity2 | undefined) => undefined);
    db.update(decodedHandle, (_prevValue: DecodedTestEntity | DecodedTestEntity2) => undefined);
  });

  this.it('throws when passing a DangerousHandle to .get() with no entry', function () {
    expect(
      () => v.DecodedEntityDB.emptyDb.get(v.Handle.dangerouslyCreateFromTypeAndId(TestEntity, 'test')),
    ).to.throw(/Could not find entity/);
  });
  // ----- End tests common to EntityDB and DecodedEntityDB -----

  this.it('does not allow setting a non-decoded entity with setEntity', function () {
    let db = v.DecodedEntityDB.emptyDb;
    const entity = new TestEntity({ id: 'test' });
    // @ts-expect-error checking assignability
    db = db.setEntity(entity);
  });
});
