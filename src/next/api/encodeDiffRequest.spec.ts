import { expect } from 'chai';
import { List } from 'immutable';
import * as v from '../index';
import DateCodec from '../codecs/DateCodec';

describe('encodeDiffRequest', () => {
  it('sets the new flag', () => {
    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        id: v.string,
        k1: v.string,
        k2: v.string,
      },
    });

    expect(v.encodeDiffRequest({
      codec: v.nullable(v.nested(Parent)),
      fromValue: null,
      toValue: new Parent({ id: 'p1', k1: 'v', k2: 'vnew' }),
    })).to.deep.equal({
      data: {
        _type: 'Parent',
        id: 'p1',
        k_1: 'v',
        k_2: 'vnew',
        _new: true,
      },
      references: {},
      versions: {
        Parent: 1,
      },
    });
  });

  it('works with readOnly', () => {
    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        id: v.string,
        k1: v.readOnly(v.string),
        k2: v.string,
      },
    });

    const from = new Parent({ id: 'p1', k1: 'k1', k2: 'k2' });
    const to = from.set('k2', 'k2new');

    const handle = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');

    const fromDb = v.EntityDB.emptyDb.setEntity(from);
    const toDb = v.EntityDB.emptyDb.setEntity(to);

    expect(v.encodeDiffRequest({
      codec: v.handle(Parent),
      fromDb,
      fromValue:  handle,
      toDb,
      toValue: handle,
    })).to.deep.equal({
      data: {
        _type: 'Parent',
        id: 'p1',
        k_2: 'k2new',
      },
      references: {},
      versions: {
        Parent: 1,
      },
    });
  });

  it('sends undefined even when the internal value for a readonly field has changed', () => {
    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        k1: v.readOnly(v.string),
      },
    });

    expect(v.encodeDiffRequest({
      codec: v.nested(Parent),
      fromValue: new Parent({ k1: 'a' }),
      toValue: new Parent({ k1: 'b' }),
    })).to.deep.equal({
      data: null,
      references: {},
      versions: {
        Parent: 1,
      },
    });
  });

  describe('writeOnce', () => {
    it('it encodes values on new entities', () => {
      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          id: v.string,
          k1: v.writeOnce(v.string),
        },
      });

      expect(v.encodeDiffRequest({
        codec: v.nullable(v.nested(Parent)),
        fromValue: null,
        toValue: new Parent({ id: 'p1', k1: 'v' }),
      })).to.deep.equal({
        data: {
          _type: 'Parent',
          id: 'p1',
          k_1: 'v',
          _new: true,
        },
        references: {},
        versions: {
          Parent: 1,
        },
      });
    });

    it('does not encode on an unmodified nested writeOnce', () => {
      const Child = v.entityConstructor({
        typeName: 'Child',
        version: 1,
        fields: {
          id: v.string,
          value: v.writeOnce(v.number),
        },
      });
      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          id: v.string,
          child: v.encodedRefHandle(Child),
        },
      });

      const child = new Child({ id: 'c', value: 0 });
      const childHandle = v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c');
      const db = v.EntityDB.emptyDb.set(childHandle, child);

      const result = v.encodeDiffRequest({
        codec: v.nullable(v.nested(Parent)),
        fromValue: null,
        fromDb: db,
        toDb: db,
        toValue: new Parent({ id: 'p1', child: childHandle }),
      });
      const childRef = Object.keys(result.references)[0];
      expect(result).to.deep.equal({
        data: {
          _type: 'Parent',
          id: 'p1',
          child: { _ref: childRef },
          _new: true,
        },
        references: {
          [childRef]: { _type: 'Child', id: 'c' },
        },
        versions: {
          Parent: 1,
          Child: 1,
        },
      });
    });

    it('encodes values in new parent and owned children entities', () => {
      const Child = v.entityConstructor({
        typeName: 'Child',
        version: 1,
        fields: {
          id: v.string,
          secret: v.writeOnce(v.number),
        },
      });
      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          id: v.string,
          password: v.writeOnce(v.string),
          child: v.nested(Child),
        },
      });

      expect(v.encodeDiffRequest({
        codec: v.nullable(v.nested(Parent)),
        fromValue: null,
        toValue: new Parent({ id: '1', password: 'hunter1', child: new Child({ id: '2', secret: 1234 }) }),
      })).to.deep.equal({
        data: {
          _type: 'Parent',
          _new: true,
          id: '1',
          password: 'hunter1',
          child: {
            _type: 'Child',
            _new: true,
            id: '2',
            secret: 1234,
          },
        },
        references: {},
        versions: {
          Parent: 1,
          Child: 1,
        },
      });
    });

    it('encodes a nested writeOnce within a non-new entity', () => {
      const Child = v.entityConstructor({
        typeName: 'Child',
        version: 1,
        fields: {
          id: v.string,
          value: v.writeOnce(v.number),
        },
      });
      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          id: v.string,
          value: v.writeOnce(v.string),
          child: v.nullable(v.encodedRefHandle(Child)),
        },
      });

      const parent = new Parent({ id: 'p', value: 'test', child: null });
      const parentHandle = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p');
      const db = v.EntityDB.emptyDb.setEntity(parent);
      const child = new Child({ id: 'c', value: 0 });
      const childHandle = v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c');
      const updatedParent = parent.set('child', childHandle);
      const toDb = db.set(childHandle, child).setEntity(updatedParent);

      const result = v.encodeDiffRequest({
        codec: v.handle(Parent),
        fromValue: parentHandle,
        fromDb: db,
        toDb,
        toValue: parentHandle,
      });
      const childRef = Object.keys(result.references)[0];
      expect(result).to.deep.equal({
        data: {
          _type: 'Parent',
          id: 'p',
          child: { _ref: childRef },
        },
        references: {
          [childRef]: { _type: 'Child', id: 'c', _new: true, value: 0 },
        },
        versions: {
          Parent: 1,
          Child: 1,
        },
      });
    });

    it('does not encode an unchanged writeOnce field in a non-new encoded ref child', () => {
      const Child = v.entityConstructor({
        typeName: 'Child',
        version: 1,
        fields: {
          id: v.string,
          value: v.writeOnce(v.number),
        },
      });
      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          id: v.string,
          value: v.writeOnce(v.string),
          child: v.nullable(v.encodedRefHandle(Child)),
        },
      });

      const child = new Child({ id: 'c', value: 0 });
      const childHandle = v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c');
      const parent = new Parent({ id: 'p', value: 'test', child: childHandle });
      const parentHandle = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p');
      const db = v.EntityDB.emptyDb.setEntity(child);
      const toDb = db.setEntity(parent);

      const result = v.encodeDiffRequest({
        codec: v.nullable(v.handle(Parent)),
        fromValue: null,
        fromDb: db,
        toDb,
        toValue: parentHandle,
      });
      const childRef = Object.keys(result.references)[0];
      expect(result).to.deep.equal({
        data: {
          _type: 'Parent',
          _new: true,
          id: 'p',
          value: 'test',
          child: { _ref: childRef },
        },
        references: {
          [childRef]: { _type: 'Child', id: 'c' },
        },
        versions: {
          Parent: 1,
          Child: 1,
        },
      });
    });

    it('sends undefined when setting writeOnce field on an existing entity', () => {
      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          k1: v.writeOnce(v.string),
        },
      });

      expect(v.encodeDiffRequest({
        codec: v.nested(Parent),
        fromValue: new Parent({ k1: 'a' }),
        toValue: new Parent({ k1: 'b' }),
      })).to.deep.equal({
        data: null,
        references: {},
        versions: {
          Parent: 1,
        },
      });
    });

    it('correctly respects the new state with writeOnce siblings', () => {
      const Child = v.entityConstructor({
        typeName: 'Child',
        version: 1,
        fields: {
          id: v.string,
          test: v.writeOnce(v.number),
        },
      });
      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          id: v.string,
          a: v.encodedRefHandle(Child),
          b: v.writeOnce(v.string),
        },
      });

      const child1 = new Child({ id: '1', test: 1 });
      const child2 = new Child({ id: '2', test: 2 });
      const parent = new Parent({ id: 'a', a: v.Handle.dangerouslyCreateFromTypeAndId(Child, child1.id), b: 'test' });
      const parent2 = new Parent({ id: 'a', a: v.Handle.dangerouslyCreateFromTypeAndId(Child, child2.id), b: 'test2' });

      const db = v.EntityDB.emptyDb.setEntity(parent).setEntity(child1);
      const toDb = v.EntityDB.emptyDb
        .setEntity(child2)
        .setEntity(parent2);

      const result = v.encodeDiffRequest({
        codec: v.handle(Parent),
        fromValue: v.Handle.dangerouslyCreateFromTypeAndId(Parent, parent.id),
        fromDb: db,
        toValue: v.Handle.dangerouslyCreateFromTypeAndId(Parent, parent2.id),
        toDb,
      });
      const childRef = Object.keys(result.references)[0];
      expect(result).to.deep.equal({
        data: {
          _type: 'Parent',
          id: 'a',
          a: { _ref: childRef },
        },
        references: {
          [childRef]: { _type: 'Child', _new: true, id: '2', test: 2 },
        },
        versions: {
          Parent: 1,
          Child: 1,
        },
      });
    });
  });

  describe('list of handles', () => {
    const Child = v.entityConstructor({
      typeName: 'Child',
      version: 1,
      fields: {
        id: v.string,
        value: v.number,
      },
    });
    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        // In general, `associationList` should be used instead in order to
        // properly diff a list of handles. `associationList` will produce a
        // minimal diff, where as `list` will simply encode the entire new list
        // when there are any changes. However, we still want to ensure that
        // `list` is able to properly diff the list when the associated entities
        // have changed.
        children: v.list(v.handle(Child)),
      },
    });

    const child = new Child({ id: 'child', value: 0 });
    const handle = v.Handle.dangerouslyCreateFromTypeAndId(Child, child.id);
    const parent = new Parent({ children: List([handle]) });
    const fromDb = v.EntityDB.emptyDb.setEntity(child);

    it('diffs a list of handles where only the associated entities have changed', () => {
      expect(v.encodeDiffRequest({
        codec: v.nested(Parent),
        fromValue: parent,
        toValue: parent,
        fromDb,
        toDb: fromDb.setEntity(child.set('value', 1)),
      })).to.deep.equal({
        data: {
          _type: 'Parent',
          children: [
            { _type: 'Child', id: 'child', value: 1 },
          ],
        },
        references: {},
        versions: {
          Parent: 1,
          Child: 1,
        },
      });
    });

    it('diffs a list of handles where the list has changed', () => {
      const child2 = new Child({ id: 'child2', value: 0 });
      const handle2 = v.Handle.dangerouslyCreateFromTypeAndId(Child, child2.id);
      expect(v.encodeDiffRequest({
        codec: v.nested(Parent),
        fromValue: parent,
        toValue: parent.set('children', List([handle, handle2])),
        fromDb,
        toDb: fromDb.setEntity(child2),
      })).to.deep.equal({
        data: {
          _type: 'Parent',
          children: [
            { _type: 'Child', id: 'child' },
            { _type: 'Child', id: 'child2', value: 0, _new: true },
          ],
        },
        references: {},
        versions: {
          Parent: 1,
          Child: 1,
        },
      });
    });

    it('returns null when nothing has changed', () => {
      expect(v.encodeDiffRequest({
        codec: v.nested(Parent),
        fromValue: parent,
        toValue: parent,
        fromDb,
        toDb: fromDb,
      })).to.deep.equal({
        data: null,
        references: {},
        versions: {
          Parent: 1,
          Child: 1,
        },
      });
    });
  });

  describe('DecodedHandle', () => {
    const Entity = v.entityConstructor({
      typeName: 'Entity',
      version: 1,
      fields: {
        id: v.string,
        value: v.string,
      },
    });

    const expectedOutput = {
      data: {
        _type: 'Entity',
        id: 'test',
        value: 'updated value',
      },
      references: {},
      versions: {
        Entity: 1,
      },
    };

    it('can encode using a DecodedHandle', () => {
      expect(v.encodeDiffRequest({
        codec: v.handle(Entity),
        fromValue: new v.DecodedHandle(Entity, Entity.decodedEntity({ id: 'test', value: 'initial value' })),
        toValue: new v.DecodedHandle(Entity, Entity.decodedEntity({ id: 'test', value: 'updated value' })),
      })).to.deep.equal(expectedOutput);
    });

    it('can encode using a Handle + EntityDB', () => {
      expect(v.encodeDiffRequest({
        codec: v.handle(Entity),
        fromValue: v.Handle.dangerouslyCreateFromTypeAndId(Entity, 'test'),
        toValue: v.Handle.dangerouslyCreateFromTypeAndId(Entity, 'test'),
        fromDb: v.EntityDB.emptyDb.setEntity(new Entity({ id: 'test', value: 'initial value' })),
        toDb: v.EntityDB.emptyDb.setEntity(new Entity({ id: 'test', value: 'updated value' })),
      })).to.deep.equal(expectedOutput);
    });

    it('uses entity in EntityDB if using both DecodedHandles and EntityDBs', () => {
      const initialEntity = Entity.decodedEntity({ id: 'test', value: 'initial value' });
      // Intentionally only use the `initialEntity` in the `DecodedHandle`, to
      // ensure that the `updated value` string must come from the `toDb`.
      const decodedHandle = new v.DecodedHandle(Entity, initialEntity);
      expect(v.encodeDiffRequest({
        codec: v.handle(Entity),
        fromValue: decodedHandle,
        toValue: decodedHandle,
        fromDb: v.EntityDB.emptyDb.setEntity(initialEntity),
        toDb: v.EntityDB.emptyDb.setEntity(new Entity({ id: 'test', value: 'updated value' })),
      })).to.deep.equal(expectedOutput);
    });
  });

  describe('view-model tests', () => {
    // Generate some types to perform tests with.
    const Child = v.entityConstructor({
      typeName: 'Child',
      version: 1,
      fields: {
        id: v.opt(v.string),
        k1: v.union([v.string, v.undefined]),
        k2: v.union([v.string, v.undefined]),
        k3: v.union([v.string, v.undefined]),
      },
    });

    const emptyChild = new Child({
      id: undefined,
      k1: undefined,
      k2: undefined,
      k3: undefined,
    });

    const emptyChildDecoded = Child.decodedEntity({
      id: '',
      k1: undefined,
      k2: undefined,
      k3: undefined,
    });

    const Timestamp = v.entityConstructor({
      typeName: 'Timestamp',
      version: 1,
      fields: {
        id: v.opt(v.string),
        k1: v.nullable(DateCodec),
        k2: v.list(DateCodec),
      },
    });

    const Section = v.entityConstructor({
      typeName: 'Section',
      version: 1,
      fields: {
        id: v.opt(v.string),
      },
    });

    const SharedText = v.entityConstructor({
      typeName: 'SharedText',
      version: 1,
      fields: {
        id: v.opt(v.string),
        text: v.string,
      },
    });

    const Target = v.entityConstructor({
      typeName: 'Target',
      version: 1,
      fields: {
        id: v.opt(v.string),
        k: v.string,
      },
    });

    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        id: v.opt(v.string),
        k1: v.union([v.string, v.null, v.undefined]),
        k2: v.union([v.string, v.null, v.undefined]),
        children: v.associationList(v.handle(Child)),
        target: v.union([v.handle(Target), v.null, v.undefined]),
        shared_text: v.union([v.refHandle(SharedText), v.null, v.undefined]),
        shared_texts: v.associationList(v.refHandle(SharedText)),
        sections: v.associationList(v.handle(Section)),
      },
    });

    const emptyParent = new Parent({
      id: undefined,
      k1: undefined,
      k2: undefined,
      children: List(),
      target: undefined,
      shared_text: undefined,
      shared_texts: List(),
      sections: List(),
    });

    const versions = {
      Child: 1,
      Parent: 1,
      Section: 1,
      SharedText: 1,
      Target: 1,
    };

    it('sets the new flag with handles', () => {
      const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');
      expect(v.encodeDiffRequest({
        codec: v.nullable(v.handle(Parent)),
        fromValue: null,
        toValue: value,
        fromDb: v.EntityDB.emptyDb,
        toDb: (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            k1: 'v',
            k2: 'vnew',
          }))
        ),
      })).to.deep.equal({
        data: {
          _type: 'Parent',
          id: 'p1',
          k_1: 'v',
          k_2: 'vnew',
          children: [],
          shared_texts: [],
          sections: [],
          _new: true,
        },
        references: {},
        versions,
      });
    });

    it('sets only changed values', () => {
      const p1 = emptyParent.merge({ id: 'p1', k1: 'v' });
      const fromDb = v.EntityDB.emptyDb.setEntity(p1);
      const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');
      expect(v.encodeDiffRequest({
        codec: v.handle(Parent),
        fromValue: value,
        toValue: value,
        fromDb,
        toDb: (
          fromDb
          .setEntity(p1.set('k2', 'vnew'))
        ),
      })).to.deep.equal({
        data: {
          _type: 'Parent',
          id: 'p1',
          k_2: 'vnew',
        },
        references: {},
        versions,
      });
    });

    describe('collections', () => {
      it('updates expliclity when creating the parent', () => {
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');
        expect(
          v.encodeDiffRequest({
            codec: v.nullable(v.handle(Parent)),
            fromValue: null,
            toValue: value,
            fromDb: v.EntityDB.emptyDb,
            toDb: (
              v.EntityDB.emptyDb
              .setEntity(emptyParent.merge({
                id: 'p1',
                children: List([
                  v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c_new_1'),
                  v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c_new_2'),
                ]),
              }))
              .setEntity(emptyChild.merge({
                id: 'c_new_1',
                k2: 'v2',
              }))
              .setEntity(emptyChild.merge({
                id: 'c_new_2',
                k3: 'v3',
              }))
            ),
          }),
        ).to.deep.equal({
          data: {
            _type: 'Parent',
            id: 'p1',
            _new: true,
            shared_texts: [],
            sections: [],
            children: [
              { _type: 'Child', id: 'c_new_1', _new: true, k_2: 'v2' },
              { _type: 'Child', id: 'c_new_2', _new: true, k_3: 'v3' },
            ],
          },
          references: {},
          versions,
        });
      });

      it('updates functionally with no common elements', () => {
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');
        const fromDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            children: List([
              v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c_old_1'),
              v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c_old_2'),
            ]),
          }))
          .setEntity(emptyChild.merge({
            id: 'c_old_1',
            k1: 'v1',
          }))
          .setEntity(emptyChild.merge({
            id: 'c_old_2',
          }))
        );
        const toDb = (
          fromDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            children: List([
              v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c_new_1'),
              v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c_new_2'),
            ]),
          }))
          .setEntity(emptyChild.merge({
            id: 'c_new_1',
            k2: 'v2',
          }))
          .setEntity(emptyChild.merge({
            id: 'c_new_2',
            k3: 'v3',
          }))
        );
        expect(
          v.encodeDiffRequest({
            codec: v.handle(Parent),
            fromValue: value,
            toValue: value,
            fromDb,
            toDb,
          }),
        ).to.deep.equal({
          data: {
            _type: 'Parent',
            id: 'p1',
            children: {
              _type: '_update',
              actions: [
                {
                  _type: 'remove',
                  // no edit data like '{k1: v1}', since we're only deleting
                  values: [
                    { _type: 'Child', id: 'c_old_1' },
                    { _type: 'Child', id: 'c_old_2' },
                  ],
                },
                {
                  _type: 'append',
                  values: [
                    { _type: 'Child', id: 'c_new_1', _new: true, k_2: 'v2' },
                    { _type: 'Child', id: 'c_new_2', _new: true, k_3: 'v3' },
                  ],
                },
              ],
            },
          },
          references: {},
          versions,
        });
      });

      it('functionally updates with common elements', () => {
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');
        const fromDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            children: List([
              v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c_update'),
              v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c_remove'),
            ]),
          }))
          .setEntity(emptyChild.merge({
            id: 'c_remove',
            k1: 'v1',
          }))
          .setEntity(emptyChild.merge({
            id: 'c_update',
          }))
        );
        const toDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            children: List([
              v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c_update'),
              v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c_append'),
            ]),
          }))
          .setEntity(emptyChild.merge({
            id: 'c_update',
            k3: 'v3',
          }))
          .setEntity(emptyChild.merge({
            id: 'c_append',
            k2: 'v2',
          }))
        );
        expect(
          v.encodeDiffRequest({
            codec: v.handle(Parent),
            fromValue: value,
            toValue: value,
            fromDb,
            toDb,
          }),
        ).to.deep.equal({
          data: {
            _type: 'Parent',
            id: 'p1',
            children: {
              _type: '_update',
              actions: [
                {
                  _type: 'append',
                  after: { _type: 'Child', id: 'c_update' },
                  values: [{ _type: 'Child', id: 'c_append', _new: true, k_2: 'v2' }],
                },
                {
                  _type: 'remove',
                  // no edit data like '{k1: v1}', since we're only deleting
                  values: [{ _type: 'Child', id: 'c_remove' }],
                },
                {
                  _type: 'update',
                  values: [{ _type: 'Child', id: 'c_update', k_3: 'v3' }],
                },
              ],
            },
          },
          references: {},
          versions,
        });
      });

      it('does not encode as a _new: true entity when adding a DecodedHandle entity', () => {
        expect(
          v.encodeDiffRequest({
            codec: v.nested(Parent),
            fromValue: emptyParent.merge({
              id: 'p1',
              children: List([]),
            }),
            toValue: emptyParent.merge({
              id: 'p1',
              children: List([
                new v.DecodedHandle(Child, emptyChildDecoded.merge({
                  id: 'c_append',
                  k2: 'v2',
                })),
              ]),
            }),
          }),
        ).to.deep.equal({
          data: {
            _type: 'Parent',
            id: 'p1',
            children: {
              _type: '_update',
              actions: [
                {
                  _type: 'append',
                  // Even though we set a field's value in the handle passed to
                  // `toValue` (`k2: v2`), no fields will be encoded here
                  // because we're not adding a new entity. We're simply
                  // encoding a reference to an existing remote entity.
                  values: [{ _type: 'Child', id: 'c_append' }],
                },
              ],
            },
          },
          references: {},
          versions,
        });
      });

      it('functionally updates with common elements in runs', () => {
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');
        const fromDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            children: List([
              v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c_begin'),
            ]),
          }))
          .setEntity(emptyChild.merge({
            id: 'c_begin',
            k1: 'anchor',
          }))
        );
        const toDb = (
          fromDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            children: List([
              v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c_begin'),
              v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c_append1'),
              v.Handle.dangerouslyCreateFromTypeAndId(Child, 'c_append2'),
            ]),
          }))
          .setEntity(emptyChild.merge({
            id: 'c_append1',
            k1: 'nc1',
          }))
          .setEntity(emptyChild.merge({
            id: 'c_append2',
            k1: 'nc2',
          }))
        );
        expect(
          v.encodeDiffRequest({
            codec: v.handle(Parent),
            fromValue: value,
            toValue: value,
            fromDb,
            toDb,
          }),
        ).to.deep.equal({
          data: {
            _type: 'Parent',
            id: 'p1',
            children: {
              _type: '_update',
              actions: [
                {
                  _type: 'append',
                  after: { _type: 'Child', id: 'c_begin' },
                  values: [
                    { _type: 'Child', id: 'c_append1', _new: true, k_1: 'nc1' },
                    { _type: 'Child', id: 'c_append2', _new: true, k_1: 'nc2' },
                  ],
                },
              ],
            },
          },
          references: {},
          versions,
        });
      });

      it('functionally updates with elements in references', () => {
        const stUpdate = SharedText.decodedEntity({
          id: 'c_update',
          text: 'before update',
        });
        const stUpdateHandle = new v.DecodedHandle(SharedText, stUpdate);
        const stRemove = SharedText.decodedEntity({
          id: 'c_remove',
          text: '',
        });
        const stRemoveHandle = new v.DecodedHandle(SharedText, stRemove);
        const stAppend = SharedText.decodedEntity({
          id: 'c_append',
          text: 'new element',
        });
        const stAppendHandle = new v.DecodedHandle(SharedText, stAppend);
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');
        const fromDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            shared_texts: List([
              stUpdateHandle,
              stRemoveHandle,
            ]),
          }))
        );
        const toDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            shared_texts: List([
              stUpdateHandle,
              stAppendHandle,
            ]),
          }))
          .setEntity(stUpdate.set('text', 'after update'))
        );
        expect(
          v.encodeDiffRequest({
            codec: v.handle(Parent),
            fromValue: value,
            toValue: value,
            fromDb,
            toDb,
          }),
        ).to.deep.equal({
          data: {
            _type: 'Parent',
            id: 'p1',
            shared_texts: {
              _type: '_update',
              // Because shared_texts uses refHandle() instead of
              // encodedRefHandle(), the referenced entity data is not encoded,
              // so the updates to `c_updated` are ignored.
              actions: [
                {
                  _type: 'append',
                  after: { _type: 'SharedText', id: 'c_update' },
                  values: [{ _ref: 'ref0' }],
                },
                {
                  _type: 'remove',
                  values: [{ _type: 'SharedText', id: 'c_remove' }],
                },
              ],
            },
          },
          references: {
            ref0: {
              _type: 'SharedText',
              id: 'c_append',
            },
          },
          versions,
        });
      });

      it('functionally updates with elements in references using encodedRefHandle()', () => {
        class EncodedChildren extends v.entityConstructor({
          typeName: 'EncodedChildren',
          version: 1,
          fields: {
            id: v.opt(v.string),
            text: v.string,
          },
        }) {}
        class ParentWithEncodedChildren extends v.entityConstructor({
          typeName: 'ParentWithEncodedChildren',
          version: 1,
          fields: {
            id: v.opt(v.string),
            children: v.associationList(v.encodedRefHandle(EncodedChildren)),
          },
        }) {}
        const value = v.Handle.dangerouslyCreateFromTypeAndId(ParentWithEncodedChildren, 'p1');
        const fromDb = (
          v.EntityDB.emptyDb
          .setEntity(new ParentWithEncodedChildren({
            id: 'p1',
            children: List([
              v.Handle.dangerouslyCreateFromTypeAndId(EncodedChildren, 'c_update'),
              v.Handle.dangerouslyCreateFromTypeAndId(EncodedChildren, 'c_remove'),
            ]),
          }))
          .setEntity(new EncodedChildren({
            id: 'c_remove',
            text: '',
          }))
          .setEntity(new EncodedChildren({
            id: 'c_update',
            text: 'before update',
          }))
        );
        // Because these use `undefined`, they use referential equality and are
        // treated as unique items in the list, so two new children will be appended.
        const appendedChildHandle1 = v.Handle.dangerouslyCreateFromTypeAndId(EncodedChildren, undefined);
        const appendedChildHandle2 = v.Handle.dangerouslyCreateFromTypeAndId(EncodedChildren, undefined);
        const toDb = (
          v.EntityDB.emptyDb
          .setEntity(new ParentWithEncodedChildren({
            id: 'p1',
            children: List([
              v.Handle.dangerouslyCreateFromTypeAndId(EncodedChildren, 'c_update'),
              appendedChildHandle1,
              appendedChildHandle2,
            ]),
          }))
          .setEntity(new EncodedChildren({
            id: 'c_update',
            text: 'after update',
          }))
          .set(appendedChildHandle1, new EncodedChildren({
            id: undefined,
            text: 'new element 1',
          }))
          .set(appendedChildHandle2, new EncodedChildren({
            id: undefined,
            text: 'new element 2',
          }))
        );
        expect(
          v.encodeDiffRequest({
            codec: v.handle(ParentWithEncodedChildren),
            fromValue: value,
            toValue: value,
            fromDb,
            toDb,
          }),
        ).to.deep.equal({
          data: {
            _type: 'ParentWithEncodedChildren',
            id: 'p1',
            children: {
              _type: '_update',
              actions: [
                {
                  _type: 'append',
                  after: { _type: 'EncodedChildren', id: 'c_update' },
                  values: [{ _ref: 'ref1' }, { _ref: 'ref2' }],
                },
                {
                  _type: 'remove',
                  values: [{ _type: 'EncodedChildren', id: 'c_remove' }],
                },
                {
                  _type: 'update',
                  values: [{ _ref: 'ref0' }],
                },
              ],
            },
          },
          references: {
            ref0: {
              _type: 'EncodedChildren',
              id: 'c_update',
              text: 'after update',
            },
            ref1: {
              _type: 'EncodedChildren',
              text: 'new element 1',
            },
            ref2: {
              _type: 'EncodedChildren',
              text: 'new element 2',
            },
          },
          versions: {
            EncodedChildren: 1,
            ParentWithEncodedChildren: 1,
          },
        });
      });

      it('supports independent handles with undefined IDs', () => {
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');
        const childHandle1 = v.Handle.dangerouslyCreateFromTypeAndId(Child, undefined);
        const childHandle2 = v.Handle.dangerouslyCreateFromTypeAndId(Child, undefined);
        const fromDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            children: List([]),
          }))
        );
        const toDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            children: List([childHandle1, childHandle2]),
          }))
          .set(childHandle1, emptyChild.merge({
            k1: 'value 1',
          }))
          .set(childHandle2, emptyChild.merge({
            k1: 'value 2',
          }))
        );
        expect(
          v.encodeDiffRequest({
            codec: v.handle(Parent),
            fromValue: value,
            toValue: value,
            fromDb,
            toDb,
          }),
        ).to.deep.equal({
          data: {
            _type: 'Parent',
            id: 'p1',
            children: {
              _type: '_update',
              actions: [
                {
                  _type: 'append',
                  values: [
                    { _type: 'Child', k_1: 'value 1' },
                    { _type: 'Child', k_1: 'value 2' },
                  ],
                },
              ],
            },
          },
          references: {},
          versions,
        });
      });

      it('does not allow multiple entries of the same handle with undefined ID', () => {
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');
        const childHandle1 = v.Handle.dangerouslyCreateFromTypeAndId(Child, undefined);
        const childHandle2 = v.Handle.dangerouslyCreateFromTypeAndId(Child, undefined);
        const fromDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            children: List([]),
          }))
        );
        const toDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            children: List([childHandle1, childHandle2, childHandle1]),
          }))
          .set(childHandle1, emptyChild.merge({
            k1: 'value 1',
          }))
          .set(childHandle2, emptyChild.merge({
            k1: 'value 2',
          }))
        );
        expect(() => {
          v.encodeDiffRequest({
            codec: v.handle(Parent),
            fromValue: value,
            toValue: value,
            fromDb,
            toDb,
          });
        }).to.throw(/Unexpected association list with multiple entries/);
      });

      it('does not allow multiple entries of handles with the same ID', () => {
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');
        const childHandle1 = v.Handle.dangerouslyCreateFromTypeAndId(Child, 'child1');
        const childHandle2 = v.Handle.dangerouslyCreateFromTypeAndId(Child, 'child2');
        const fromDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            children: List([]),
          }))
        );
        const toDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            children: List([childHandle1, childHandle2, childHandle1]),
          }))
          .set(childHandle1, emptyChild.merge({
            id: 'child1',
            k1: 'value 1',
          }))
          .set(childHandle2, emptyChild.merge({
            id: 'child2',
            k1: 'value 2',
          }))
        );
        expect(() => {
          v.encodeDiffRequest({
            codec: v.handle(Parent),
            fromValue: value,
            toValue: value,
            fromDb,
            toDb,
          });
        }).to.throw(/Unexpected association list with multiple entries/);
      });

      it('supports combination of handles with IDs and handles with undefined IDs', () => {
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');
        const persistedChildHandle = v.Handle.dangerouslyCreateFromTypeAndId(Child, 'child1');
        const newChildHandle = v.Handle.dangerouslyCreateFromTypeAndId(Child, undefined);
        const fromDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            children: List([persistedChildHandle]),
          }))
          .set(persistedChildHandle, emptyChild.merge({
            id: 'child1',
            k1: 'value 1',
          }))
        );
        const toDb = (
          fromDb
          .setEntity(emptyParent.merge({
            id: 'p1',
            children: List([persistedChildHandle, newChildHandle]),
          }))
          .set(newChildHandle, emptyChild.merge({
            k1: 'value 2',
          }))
        );
        expect(
          v.encodeDiffRequest({
            codec: v.handle(Parent),
            fromValue: value,
            toValue: value,
            fromDb,
            toDb,
          }),
        ).to.deep.equal({
          data: {
            _type: 'Parent',
            id: 'p1',
            children: {
              _type: '_update',
              actions: [
                {
                  _type: 'append',
                  after: {
                    _type: 'Child',
                    id: 'child1',
                  },
                  values: [
                    { _type: 'Child', k_1: 'value 2' },
                  ],
                },
              ],
            },
          },
          references: {},
          versions,
        });
      });

      it('supports independent entities with undefined IDs', () => {
        const NestedChild = v.entityConstructor({
          typeName: 'Child',
          version: 1,
          fields: {
            id: v.opt(v.string),
            value: v.string,
          },
        });
        const ParentWithNestedChildren = v.entityConstructor({
          typeName: 'Parent',
          version: 1,
          fields: {
            id: v.opt(v.string),
            children: v.associationList(v.nested(NestedChild)),
          },
        });

        const value = v.Handle.dangerouslyCreateFromTypeAndId(ParentWithNestedChildren, 'p1');
        const child1 = new NestedChild({ id: undefined, value: 'value 1' });
        const child2 = new NestedChild({ id: undefined, value: 'value 2' });
        const fromDb = (
          v.EntityDB.emptyDb
          .setEntity(new ParentWithNestedChildren({
            id: 'p1',
            children: List([]),
          }))
        );
        const toDb = (
          v.EntityDB.emptyDb
          .setEntity(new ParentWithNestedChildren({
            id: 'p1',
            children: List([child1, child2]),
          }))
        );
        expect(
          v.encodeDiffRequest({
            codec: v.handle(ParentWithNestedChildren),
            fromValue: value,
            toValue: value,
            fromDb,
            toDb,
          }),
        ).to.deep.equal({
          data: {
            _type: 'Parent',
            id: 'p1',
            children: {
              _type: '_update',
              actions: [
                {
                  _type: 'append',
                  values: [
                    { _type: 'Child', value: 'value 1' },
                    { _type: 'Child', value: 'value 2' },
                  ],
                },
              ],
            },
          },
          references: {},
          versions: {
            Parent: 1,
            Child: 1,
          },
        });
      });
    });

    it('handles associations', () => {
      const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');
      const p1 = emptyParent.merge({ id: 'p1' });
      expect(
        v.encodeDiffRequest({
          codec: v.handle(Parent),
          fromValue: value,
          toValue: value,
          fromDb: (
            v.EntityDB.emptyDb
            .setEntity(p1)
          ),
          toDb: (
            v.EntityDB.emptyDb
            .setEntity(p1.merge({
              target: v.Handle.dangerouslyCreateFromTypeAndId(Target, 't1'),
            }))
            .setEntity(new Target({
              id: 't1',
              k: 'v',
            }))
          ),
        }),
      ).to.deep.equal({
        data: {
          _type: 'Parent',
          id: 'p1',
          target: { _type: 'Target', id: 't1', _new: true, k: 'v' },
        },
        references: {},
        versions,
      });
    });

    it('handles association deletes', () => {
      const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');
      const p1 = emptyParent.merge({ id: 'p1', target: null });
      expect(
        v.encodeDiffRequest({
          codec: v.handle(Parent),
          fromValue: value,
          toValue: value,
          fromDb: (
            v.EntityDB.emptyDb
            .setEntity(p1.merge({
              target: v.Handle.dangerouslyCreateFromTypeAndId(Target, 't1'),
            }))
            .setEntity(new Target({
              id: 't1',
              k: 'v',
            }))
          ),
          toDb: (
            v.EntityDB.emptyDb
            .setEntity(p1)
          ),
        }),
      ).to.deep.equal({
        data: {
          _type: 'Parent',
          id: 'p1',
          target: null,
        },
        references: {},
        versions,
      });
    });

    it('references unmodified associations', () => {
      const p1 = emptyParent.merge({ id: 'p1' });
      const t1 = new Target({ id: 't1', k: 'v1' });
      const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');

      expect(
        v.encodeDiffRequest({
          codec: v.handle(Parent),
          fromValue: value,
          toValue: value,
          fromDb: (
            v.EntityDB.emptyDb
            .setEntity(p1)
            .setEntity(t1)
          ),
          toDb: (
            v.EntityDB.emptyDb
            .setEntity(p1.set('target', v.Handle.dangerouslyCreateFromTypeAndId(Target, 't1')))
            .setEntity(t1)
          ),
        }),
      ).to.deep.equal({
        data: {
          _type: 'Parent',
          id: 'p1',
          target: { _type: 'Target', id: 't1' },
        },
        references: {},
        versions,
      });
    });

    it('references unmodified associations in lists', () => {
      const p1 = emptyParent.merge({ id: 'p1' });
      const s1 = new Section({ id: 's1' });
      const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');

      expect(
        v.encodeDiffRequest({
          codec: v.handle(Parent),
          fromValue: value,
          toValue: value,
          fromDb: (
            v.EntityDB.emptyDb
            .setEntity(p1)
            .setEntity(s1)
          ),
          toDb: (
            v.EntityDB.emptyDb
            .setEntity(p1.set('sections', List([v.Handle.dangerouslyCreateFromTypeAndId(Section, 's1')])))
            .setEntity(s1)
          ),
        }),
      ).to.deep.equal({
        data: {
          _type: 'Parent',
          id: 'p1',
          sections: {
            _type: '_update',
            actions: [
              {
                _type: 'append',
                values: [
                  { _type: 'Section', id: 's1' },
                ],
              },
            ],
          },
        },
        references: {},
        versions,
      });
    });

    it('applies context to changed entities', () => {
      const p1 = emptyParent.merge({ id: 'p1', target: v.Handle.dangerouslyCreateFromTypeAndId(Target, 't1') });
      const t1 = new Target({ id: 't1', k: 'v1' });
      const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');

      expect(
        v.encodeDiffRequest({
          codec: v.handle(Parent),
          fromValue: value,
          toValue: value,
          fromDb: (
            v.EntityDB.emptyDb
            .setEntity(p1)
            .setEntity(t1)
          ),
          toDb: (
            v.EntityDB.emptyDb
            .setEntity(p1)
            .setEntity(t1.set('k', 'v2'))
          ),
        }),
      ).to.deep.equal({
        data: {
          _type: 'Parent',
          id: 'p1',
          target: { _type: 'Target', id: 't1', k: 'v2' },
        },
        references: {},
        versions,
      });
    });

    it('serializes types that have a marshaller', () => {
      const t1 = new Timestamp({
        id: 't1',
        k1: null,
        k2: List(),
      });
      const value = v.Handle.dangerouslyCreateFromTypeAndId(Timestamp, 't1');

      expect(v.encodeDiffRequest({
        codec: v.handle(Timestamp),
        fromValue: value,
        toValue: value,
        fromDb: (
          v.EntityDB.emptyDb.setEntity(t1)
        ),
        toDb: (
          v.EntityDB.emptyDb.setEntity(t1.merge({
            k1: new Date(1),
            k2: List([new Date(2), new Date(3)]),
          }))
        ),
      })).to.deep.equal({
        data: {
          _type: 'Timestamp',
          id: 't1',
          k_1: '1970-01-01T00:00:00.001Z',
          k_2: ['1970-01-01T00:00:00.002Z', '1970-01-01T00:00:00.003Z'],
        },
        references: {},
        versions: {
          Timestamp: 1,
        },
      });
    });

    describe('shared entities', () => {
      it('ignores unchanged shared resources', () => {
        const st1 = SharedText.decodedEntity({ id: 'st1', text: 'some text' });
        const st1Handle = new v.DecodedHandle(SharedText, st1);
        const p1 = emptyParent.merge({
          id: 'p1',
          shared_text: st1Handle,
        });
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');

        expect(
          v.encodeDiffRequest({
            codec: v.handle(Parent),
            fromValue: value,
            toValue: value,
            fromDb: (
              v.EntityDB.emptyDb
              .setEntity(p1)
              .setEntity(st1)
            ),
            toDb: (
              v.EntityDB.emptyDb
              .setEntity(p1)
              .setEntity(st1)
            ),
          }),
        ).to.deep.equal({ data: null, references: {}, versions });
      });

      it('includes changes to shared resources', () => {
        // Same as `Parent`, but encodes `shared_text`
        const ParentEncodeShared = v.entityConstructor({
          typeName: Parent.typeName,
          version: Parent.version,
          fields: {
            id: Parent.fields.id,
            shared_text: v.union([v.encodedRefHandle(SharedText), v.null, v.undefined]),
          },
        });

        const p1 = new ParentEncodeShared({ id: 'p1', shared_text: v.Handle.dangerouslyCreateFromTypeAndId(SharedText, 'st1') });
        const st1 = new SharedText({ id: 'st1', text: 'old text' });
        const value = v.Handle.dangerouslyCreateFromTypeAndId(ParentEncodeShared, 'p1');

        const result = v.encodeDiffRequest({
          codec: v.handle(ParentEncodeShared),
          fromValue: value,
          toValue: value,
          fromDb: (
            v.EntityDB.emptyDb
            .setEntity(p1)
            .setEntity(st1)
          ),
          toDb: (
            v.EntityDB.emptyDb
            .setEntity(p1)
            .setEntity(st1.set('text', 'new text'))
          ),
        });

        const st1Ref = Object.keys(result.references)[0];

        expect(result).to.deep.equal({
          data: {
            _type: 'Parent',
            id: 'p1',
            shared_text: { _ref: st1Ref },
          },
          references: {
            [st1Ref]: {
              _type: 'SharedText',
              id: 'st1',
              text: 'new text',
            },
          },
          versions: {
            Parent: versions.Parent,
            SharedText: versions.SharedText,
          },
        });
      });

      it('works with polymorphism via unions', () => {
        const PolyEntity = v.entityConstructor({
          typeName: 'PolyEntity',
          version: 1,
          fields: {
            id: v.opt(v.string),
            k1: v.string,
          },
        });

        const PolySubEntity = v.entityConstructor({
          typeName: 'PolySubEntity',
          version: 1,
          fields: {
            ...PolyEntity.fields,
            k2: v.string,
          },
        });

        const PolyOwner = v.entityConstructor({
          typeName: 'PolyOwner',
          version: 1,
          fields: {
            id: v.opt(v.string),
            resource: v.union([
              v.encodedRefHandle(PolyEntity),
              v.encodedRefHandle(PolySubEntity),
            ]),
          },
        });

        const owner = new PolyOwner({
          id: 'owner',
          resource: v.Handle.dangerouslyCreateFromTypeAndId(PolySubEntity, 'res'),
        });

        const res = new PolySubEntity({
          id: 'res',
          k1: 'something',
          k2: 'a tall mountain',
        });

        const value = v.Handle.dangerouslyCreateFromTypeAndId(PolyOwner, 'owner');

        expect(
          v.encodeDiffRequest({
            codec: v.handle(PolyOwner),
            fromValue: value,
            toValue: value,
            fromDb: (
              v.EntityDB.emptyDb
              .setEntity(owner)
              .setEntity(res)
            ),
            toDb: (
              v.EntityDB.emptyDb
              .setEntity(owner)
              .setEntity(res.merge({
                k1: 'something else',
                k2: 'still a mountain',
              }))
            ),
          }),
        ).to.deep.equal({
          data: {
            _type: 'PolyOwner',
            id: 'owner',
            resource: {
              _ref: 'ref0',
            },
          },
          references: {
            ref0: {
              _type: 'PolySubEntity',
              id: 'res',
              k_1: 'something else',
              k_2: 'still a mountain',
            },
          },
          versions: {
            PolyEntity: 1,
            PolyOwner: 1,
            PolySubEntity: 1,
          },
        });
      });

      it('ignores unchanged dangling handles', () => {
        const p1 = emptyParent.merge({ id: 'p1', shared_text: v.Handle.dangerouslyCreateFromTypeAndId(SharedText, 'st1') });
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');

        expect(
          v.encodeDiffRequest({
            codec: v.handle(Parent),
            fromValue: value,
            toValue: value,
            fromDb: (
              v.EntityDB.emptyDb
              .setEntity(p1)
            ),
            toDb: (
              v.EntityDB.emptyDb
              .setEntity(p1)
            ),
          }),
        ).to.deep.equal({ data: null, references: {}, versions });
      });

      it('supports adding a dangling handle', () => {
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');

        const result = v.encodeDiffRequest({
          codec: v.handle(Parent),
          fromValue: value,
          toValue: value,
          fromDb: (
            v.EntityDB.emptyDb
            .setEntity(emptyParent.merge({ id: 'p1' }))
          ),
          toDb: (
            v.EntityDB.emptyDb
            .setEntity(emptyParent.merge({ id: 'p1', shared_text: v.Handle.dangerouslyCreateFromTypeAndId(SharedText, 'st1') }))
          ),
        });

        const st1Ref = Object.keys(result.references)[0];

        expect(result).to.deep.equal({
          data: {
            _type: 'Parent',
            id: 'p1',
            shared_text: { _ref: st1Ref },
          },
          references: {
            [st1Ref]: {
              _type: 'SharedText',
              id: 'st1',
            },
          },
          versions,
        });
      });

      it('supports changing a dangling handle', () => {
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');

        const result = v.encodeDiffRequest({
          codec: v.handle(Parent),
          fromValue: value,
          toValue: value,
          fromDb: (
            v.EntityDB.emptyDb
            .setEntity(emptyParent.merge({ id: 'p1', shared_text: v.Handle.dangerouslyCreateFromTypeAndId(SharedText, 'st1') }))
          ),
          toDb: (
            v.EntityDB.emptyDb
            .setEntity(emptyParent.merge({ id: 'p1', shared_text: v.Handle.dangerouslyCreateFromTypeAndId(SharedText, 'st2') }))
          ),
        });

        const st2Ref = Object.keys(result.references)[0];

        expect(result).to.deep.equal({
          data: {
            _type: 'Parent',
            id: 'p1',
            shared_text: { _ref: st2Ref },
          },
          references: {
            [st2Ref]: {
              _type: 'SharedText',
              id: 'st2',
            },
          },
          versions,
        });
      });

      it('supports removing a dangling handle', () => {
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');

        expect(
          v.encodeDiffRequest({
            codec: v.handle(Parent),
            fromValue: value,
            toValue: value,
            fromDb: (
              v.EntityDB.emptyDb
              .setEntity(emptyParent.merge({ id: 'p1', shared_text: v.Handle.dangerouslyCreateFromTypeAndId(SharedText, 'st1') }))
            ),
            toDb: (
              v.EntityDB.emptyDb
              .setEntity(emptyParent.merge({ id: 'p1', shared_text: null }))
            ),
          }),
        ).to.deep.equal({
          data: {
            _type: 'Parent',
            id: 'p1',
            shared_text: null,
          },
          references: {},
          versions,
        });
      });

      it('does not include changes to shared resources', () => {
        const st1 = SharedText.decodedEntity({ id: 'st1', text: 'old text' });
        const st2 = SharedText.decodedEntity({ id: 'st2', text: 'old text' });
        const st1Handle = new v.DecodedHandle(SharedText, st1);
        const st2Handle = new v.DecodedHandle(SharedText, st2);
        const p1 = emptyParent.merge({
          id: 'p1',
          shared_text: st1Handle,
          shared_texts: List([st2Handle]),
        });
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');

        const result = v.encodeDiffRequest({
          codec: v.handle(Parent),
          fromValue: value,
          toValue: value,
          fromDb: (
            v.EntityDB.emptyDb
            .setEntity(p1)
          ),
          toDb: (
            v.EntityDB.emptyDb
            .setEntity(p1.set('k1', 'update parent'))
            .setEntity(st1.set('text', 'new text'))
            .setEntity(st2.set('text', 'new text'))
          ),
        });

        expect(result).to.deep.equal({
          data: {
            _type: 'Parent',
            id: 'p1',
            k_1: 'update parent',
          },
          references: {},
          versions,
        });
      });

      it('is empty if only shared resources changed', () => {
        const st1 = SharedText.decodedEntity({ id: 'st1', text: 'old text' });
        const st2 = SharedText.decodedEntity({ id: 'st2', text: 'old text' });
        const st1Handle = new v.DecodedHandle(SharedText, st1);
        const st2Handle = new v.DecodedHandle(SharedText, st2);
        const p1 = emptyParent.merge({
          id: 'p1',
          shared_text: st1Handle,
          shared_texts: List([st2Handle]),
        });
        const value = v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'p1');

        const result = v.encodeDiffRequest({
          codec: v.handle(Parent),
          fromValue: value,
          toValue: value,
          fromDb: (
            v.EntityDB.emptyDb
            .setEntity(p1)
          ),
          toDb: (
            v.EntityDB.emptyDb
            .setEntity(p1)
            .setEntity(st1.set('text', 'new text'))
            .setEntity(st2.set('text', 'new text'))
          ),
        });

        expect(result).to.deep.equal({
          data: null,
          references: {},
          versions,
        });
      });
    });

    describe('external associations', () => {
      const ExternalAssociation = v.entityConstructor({
        typeName: 'ExternalAssociation',
        version: undefined,
        fields: {
          id: v.opt(v.string),
          parents: v.nullable(v.associationList(v.handle(Parent))),
        },
      });

      it('diffs the lists', () => {
        const fromDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({ id: 'added' }))
          .setEntity(emptyParent.merge({ id: 'common' }))
          .setEntity(emptyParent.merge({ id: 'removed' }))
          .setEntity(new ExternalAssociation({
            id: 'test',
            parents: List([v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'common'), v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'removed')]),
          }))
        );
        const toDb = (
          fromDb
          .setEntity(emptyParent.merge({ id: 'common', k1: 'hello' }))
          .setEntity(new ExternalAssociation({
            id: 'test',
            parents: List([v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'added'), v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'common')]),
          }))
        );
        expect(
          v.encodeDiffRequest({
            codec: ExternalAssociation.fields.parents,
            fromValue: fromDb.get(v.Handle.dangerouslyCreateFromTypeAndId(ExternalAssociation, 'test')).parents,
            toValue: toDb.get(v.Handle.dangerouslyCreateFromTypeAndId(ExternalAssociation, 'test')).parents,
            fromDb,
            toDb,
          }),
        ).to.deep.equal({
          data: {
            _type: '_update',
            actions: [
              {
                _type: 'append',
                before: { id: 'common', _type: 'Parent' },
                values: [
                  { id: 'added', _type: 'Parent' },
                ],
              },
              {
                _type: 'remove',
                values: [
                  { id: 'removed', _type: 'Parent' },
                ],
              },
              {
                _type: 'update',
                values: [
                  {
                    _type: 'Parent',
                    id: 'common',
                    k_1: 'hello',
                  },
                ],
              },
            ],
          },
          references: {},
          versions,
        });
      });

      it('handles no changes', () => {
        const fromDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({ id: 'id1' }))
          .setEntity(emptyParent.merge({ id: 'id2' }))
          .setEntity(new ExternalAssociation({
            id: 'test',
            parents: List([v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'id1'), v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'id2')]),
          }))
        );
        expect(
          v.encodeDiffRequest({
            codec: ExternalAssociation.fields.parents,
            fromValue: fromDb.get(v.Handle.dangerouslyCreateFromTypeAndId(ExternalAssociation, 'test')).parents,
            toValue: fromDb.get(v.Handle.dangerouslyCreateFromTypeAndId(ExternalAssociation, 'test')).parents,
            fromDb,
            toDb: fromDb,
          }),
        ).to.deep.equal({
          data: null,
          references: {},
          versions,
        });
      });

      it('distinguishes between empty list and null', () => {
        const fromDb = (
          v.EntityDB.emptyDb
          .setEntity(emptyParent.merge({ id: 'id1' }))
          .setEntity(emptyParent.merge({ id: 'id2' }))
          .setEntity(new ExternalAssociation({
            id: 'test',
            parents: List([v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'id1'), v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'id2')]),
          }))
        );
        const toDb = (
          fromDb
          .setEntity(new ExternalAssociation({
            id: 'test',
            parents: List(),
          }))
        );
        expect(
          v.encodeDiffRequest({
            codec: ExternalAssociation.fields.parents,
            fromValue: fromDb.get(v.Handle.dangerouslyCreateFromTypeAndId(ExternalAssociation, 'test')).parents,
            toValue: toDb.get(v.Handle.dangerouslyCreateFromTypeAndId(ExternalAssociation, 'test')).parents,
            fromDb,
            toDb,
          }),
        ).to.deep.equal({
          data: {
            _type: '_update',
            actions: [
              {
                _type: 'remove',
                values: [
                  { id: 'id1', _type: 'Parent' },
                  { id: 'id2', _type: 'Parent' },
                ],
              },
            ],
          },
          references: {},
          versions,
        });

        // null
        expect(
          v.encodeDiffRequest({
            codec: ExternalAssociation.fields.parents,
            fromValue: fromDb.get(v.Handle.dangerouslyCreateFromTypeAndId(ExternalAssociation, 'test')).parents,
            toValue: null,
            fromDb,
            toDb: fromDb,
          }),
        ).to.deep.equal({
          data: null,
          references: {},
          versions,
        });
      });
    });
  });
});
