import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { fromJS, List, Map } from 'immutable';
import { longestCommonSubsequence } from './upload';
import ViewModelClient from '../';
import ViewModelClientError from '../utils/ViewModelClientError';

import { DateMarshaller } from '../tests/shared';

describe('longestCommonSubsequence', () => {
  it('works', () => {
    expect(
      longestCommonSubsequence(List.of(1, 2, 3), List.of(2, 3, 4)),
    ).to.eql(
      List.of(2, 3),
    );

    expect(
      longestCommonSubsequence(List.of(1, 2), List.of(1, 3)),
    ).to.eql(
      List.of(1),
    );
  });
});

describe('serializeEdits', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  const vmClient = new ViewModelClient();

  // Generate some types to perform tests with.
  const Child = vmClient.defineClass({
    typeName: 'Child',
    version: 1,
    persisted: true,
    storePrefix: 'Children',
    attributes: {
      k1: 'string',
      k2: 'string',
      k3: 'string',
    },
  });

  const Timestamp = vmClient.defineClass({
    typeName: 'Timestamp',
    version: 1,
    persisted: true,
    attributes: {
      k1: {
        type: Date,
        marshaller: DateMarshaller,
      },
      k2: {
        type: Date,
        marshaller: DateMarshaller,
        collection: true,
      },
    },
  });

  const Section = vmClient.defineClass({
    typeName: 'Section',
    version: 1,
    persisted: true,
  });

  const SharedText = vmClient.defineClass({
    typeName: 'SharedText',
    version: 1,
    persisted: true,
    shared: true,
    attributes: {
      text: 'string',
    },
  });

  const Target = vmClient.defineClass({
    typeName: 'Target',
    version: 1,
    persisted: true,
    attributes: {
      k: 'string',
    },
  });

  const Parent = vmClient.defineClass({
    typeName: 'Parent',
    version: 1,
    persisted: true,
    associations: {
      children: [Child],
      target: Target,
      shared_text: { type: SharedText, shared: true },
      shared_texts: { type: SharedText, collection: true, shared: true },
      sections: [Section],
    },
    attributes: {
      k1: 'string',
      k2: 'string',
    },
  });

  const ExternalAssociation = vmClient.defineExternalAssociation({
    typeName: 'ExternalAssociation',
    associationType: Parent,
  });

  const PolyEntity = vmClient.defineClass({
    typeName: 'PolyEntity',
    version: 1,
    persisted: true,
    attributes: {
      k1: 'string',
    },
  });

  const PolyOwner = vmClient.defineClass({
    typeName: 'PolyOwner',
    version: 1,
    persisted: true,
    associations: {
      resource: { type: PolyEntity, shared: true },
    },
  });

  const PolyEntityImpl = vmClient.defineClass({
    typeName: 'PolyEntityImpl',
    version: 1,
    persisted: true,
    extends: PolyEntity,
    attributes: {
      k2: 'string',
    },
  });

  const serializeDiff = (rootType, rootID, rawBase, rawUpdated, options) => {
    const base = fromJS(rawBase);
    const updated = fromJS(rawUpdated);
    return vmClient.serializeEdits(updated, base, rootType, rootID, options);
  };

  const versions = {
    Child: 1,
    Parent: 1,
    Section: 1,
    SharedText: 1,
    Target: 1,
  };

  it('sets the new flag', () => {
    expect(serializeDiff(
      Parent,
      'p1',
      {},
      {
        [Parent.storePrefix]: {
          p1: new Parent({ _type: 'Parent', id: 'p1', k1: 'v', k2: 'vnew' }),
        },
      },
    )).to.eql({
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
    const p1 = new Parent({ _type: 'Parent', id: 'p1', k1: 'v' });
    expect(serializeDiff(
      Parent,
      'p1',
      { [Parent.storePrefix]: { p1 } },
      { [Parent.storePrefix]: { p1: p1.set('k2', 'vnew') } },
    )).to.eql({
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
      expect(
        serializeDiff(
          Parent,
          'p1',
          {
            [Parent.storePrefix]: {},
            children: {},
          },
          {
            [Parent.storePrefix]: {
              p1: new Parent({ _type: 'Parent', id: 1, children: List(['c_new_1', 'c_new_2']) }),
            },

            [Child.storePrefix]: {
              c_new_1: new Child({ _type: 'Child', id: 'c_new_1', k2: 'v2' }),
              c_new_2: new Child({ _type: 'Child', id: 'c_new_2', k3: 'v3' }),
            },
          }),
      ).to.eql({
        data: {
          _type: 'Parent',
          id: 1,
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
      expect(
        serializeDiff(
          Parent,
          'p1',
          {
            [Parent.storePrefix]: {
              p1: new Parent({ _type: 'Parent', id: 1, children: List(['c_old_1', 'c_old_2']) }),
            },

            [Child.storePrefix]: {
              c_old_1: new Child({ _type: 'Child', id: 'c_old_1', k1: 'v1' }),
              c_old_2: new Child({ _type: 'Child', id: 'c_old_2' }),
            },
          },
          {
            [Parent.storePrefix]: {
              p1: new Parent({ _type: 'Parent', id: 1, children: List(['c_new_1', 'c_new_2']) }),
            },

            [Child.storePrefix]: {
              c_new_1: new Child({ _type: 'Child', id: 'c_new_1', k2: 'v2' }),
              c_new_2: new Child({ _type: 'Child', id: 'c_new_2', k3: 'v3' }),
            },
          }),
      ).to.eql({
        data: {
          _type: 'Parent', id: 1,
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
      expect(
        serializeDiff(
          Parent,
          'p1',
          {
            [Parent.storePrefix]: {
              p1: new Parent({ _type: 'Parent', id: 1, children: List(['c_update', 'c_remove']) }),
            },

            [Child.storePrefix]: {
              c_remove: new Child({ _type: 'Child', id: 'c_remove', k1: 'v1' }),
              c_update: new Child({ _type: 'Child', id: 'c_update' }),
            },
          },
          {
            [Parent.storePrefix]: {
              p1: new Parent({ _type: 'Parent', id: 1, children: List(['c_update', 'c_append']) }),
            },

            [Child.storePrefix]: {
              c_append: new Child({ _type: 'Child', id: 'c_append', k2: 'v2' }),
              c_update: new Child({ _type: 'Child', id: 'c_update', k3: 'v3' }),
            },
          }),
      ).to.eql({
        data: {
          _type: 'Parent', id: 1,
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

    it('functionally updates with common elements in runs', () => {
      expect(
        serializeDiff(
          Parent,
          'p1',
          {
            [Parent.storePrefix]: {
              p1: new Parent({ _type: 'Parent', id: 1, children: List(['c_begin']) }),
            },

            [Child.storePrefix]: {
              c_begin: new Child({ _type: 'Child', id: 'c_begin', k1: 'anchor' }),
            },
          },
          {
            [Parent.storePrefix]: {
              p1: new Parent({
                _type: 'Parent',
                id: 1,
                children: List(['c_begin', 'c_append1', 'c_append2']),
              }),
            },

            [Child.storePrefix]: {
              c_begin: new Child({ _type: 'Child', id: 'c_begin', k1: 'anchor' }),
              c_append1: new Child({ _type: 'Child', id: 'c_append1', k1: 'nc1' }),
              c_append2: new Child({ _type: 'Child', id: 'c_append2', k1: 'nc2' }),
            },
          }),
      ).to.eql({
        data: {
          _type: 'Parent', id: 1,
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
  });

  it('handles associations', () => {
    const p1 = new Parent({ _type: 'Parent', id: 1 });
    expect(
      serializeDiff(
        Parent,
        'p1',
        {
          [Parent.storePrefix]: { p1 },
        },
        {
          [Parent.storePrefix]: { p1: p1.set('target', 't1') },
          [Target.storePrefix]: { t1: new Target({ _type: 'Target', id: 2, k: 'v' }) },
        }),
    ).to.eql({
      data: {
        _type: 'Parent',
        id: 1,
        target: { _type: 'Target', id: 2, _new: true, k: 'v' },
      },
      references: {},
      versions,
    });
  });

  it('handles association deletes', () => {
    const p1 = new Parent({ _type: 'Parent', id: 1 });
    expect(
      serializeDiff(
        Parent,
        'p1',
        {
          [Parent.storePrefix]: { p1: p1.set('target', 't1') },
          [Target.storePrefix]: { t1: new Target({ _type: 'Target', id: 2, k: 'v' }) },
        },
        {
          [Parent.storePrefix]: { p1: p1.set('target', null) },
        },
      ),
    ).to.eql({
      data: {
        _type: 'Parent',
        id: 1,
        target: null,
      },
      references: {},
      versions,
    });
  });

  it('uses entity specific makeReference to refer to entities', () => {
    const p1 = new Parent({ _type: 'Parent', id: 1 });
    const s1 = new Section({ _type: 'Section', id: 1 });

    expect(s1.makeReference()).to.eql(fromJS({
      _type: 'Section',
      id: 1,
    }));

    expect(
      serializeDiff(
        Parent,
        'p1',
        {
          [Parent.storePrefix]: { p1 },
          [Section.storePrefix]: { s1 },
        },
        {
          [Parent.storePrefix]: { p1: p1.set('sections', List.of('s1')) },
          [Section.storePrefix]: { s1 },
        }),
    ).to.eql({
      data: {
        _type: 'Parent',
        id: 1,
        sections: {
          _type: '_update',
          actions: [
            {
              _type: 'append',
              values: [
                { _type: 'Section', id: 1 },
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
    const p1 = new Parent({ _type: 'Parent', id: 1, target: 't1' });
    const t1 = new Target({ _type: 'Target', id: 2, k: 'v1' });

    expect(
      serializeDiff(
        Parent,
        'p1',
        {
          [Parent.storePrefix]: { p1 },
          [Target.storePrefix]: { t1 },
        },
        {
          [Parent.storePrefix]: { p1 },
          [Target.storePrefix]: { t1: t1.set('k', 'v2') },
        }),
    ).to.eql({
      data: {
        _type: 'Parent',
        id: 1,
        target: { _type: 'Target', id: 2, k: 'v2' },
      },
      references: {},
      versions,
    });
  });

  it('serializes types that have a marshaller', () => {
    const t1 = new Timestamp({ id: 't1' });

    const updated = t1.merge({
      k1: new Date(1),
      k2: List([new Date(2), new Date(3)]),
    });

    const remote = Map({
      [Timestamp.storePrefix]: Map({ t1 }),
    });

    const local = Map({
      [Timestamp.storePrefix]: Map({ t1: updated }),
    });

    const expected = {
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
    };

    // Can't use serializeDiffs, since fromJS will stringify non immutable types.
    expect(vmClient.serializeEdits(local, remote, Timestamp, 't1')).to.eql(expected);
  });

  it("doesn't run null through DateMarsahller", () => {
    const serialize = sandbox.spy(DateMarshaller, 'serialize');
    const t1 = new Timestamp({ id: 't1', k1: new Date(1) });

    const updated = t1.merge({ k1: null });

    const remote = Map({
      [Timestamp.storePrefix]: Map({ t1 }),
    });

    const local = Map({
      [Timestamp.storePrefix]: Map({ t1: updated }),
    });

    const expected = {
      data: {
        _type: 'Timestamp',
        id: 't1',
        k_1: null,
      },
      references: {},
      versions: {
        Timestamp: 1,
      },
    };

    expect(vmClient.serializeEdits(local, remote, Timestamp, 't1')).to.eql(expected);
    expect(serialize.called).to.equal(false);
  });

  describe('shared entities', () => {
    it('ignores unchanged shared resources', () => {
      const p1 = new Parent({ _type: 'Parent', id: 'p1', shared_text: 'st1' });
      const st1 = new SharedText({ _type: 'SharedText', id: 'st1', text: 'some text' });
      const result = serializeDiff(
        Parent,
        'p1',
        {
          [Parent.storePrefix]: { p1 },
          [SharedText.storePrefix]: { st1 },
        },
        {
          [Parent.storePrefix]: { p1 },
          [SharedText.storePrefix]: { st1 },
        },
      );

      expect(result).to.eql({ data: null, references: {}, versions });
    });

    it('includes changes to shared resources', () => {
      const p1 = new Parent({ _type: 'Parent', id: 'p1', shared_text: 'st1' });
      const st1 = new SharedText({ _type: 'SharedText', id: 'st1', text: 'old text' });
      const result = serializeDiff(
        Parent,
        'p1',
        {
          [Parent.storePrefix]: { p1 },
          [SharedText.storePrefix]: { st1 },
        },
        {
          [Parent.storePrefix]: { p1 },
          [SharedText.storePrefix]: { st1: st1.set('text', 'new text') },
        },
      );

      const st1Ref = Object.keys(result.references)[0];
      expect(result).to.eql({
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
        versions,
      });
    });

    describe('serializeShared is false', () => {
      it('does not include changes to entities inside shared associations', () => {
        const p1 = new Parent({
          _type: 'Parent',
          id: 'p1',
          shared_text: 'st1',
        });
        const st1 = new SharedText({ _type: 'SharedText', id: 'st1', text: 'old text' });
        const result = serializeDiff(
          Parent,
          'p1',
          {
            [Parent.storePrefix]: { p1 },
            [SharedText.storePrefix]: { st1 },
          },
          {
            [Parent.storePrefix]: {
              p1: p1.set('k1', 'value'),
            },
            [SharedText.storePrefix]: {
              st1: st1.set('text', 'new text'),
            },
          },
          { serializeShared: false },
        );

        expect(result).to.eql({
          data: {
            _type: 'Parent',
            id: 'p1',
            // Does include change to root entity's attribute, but not to shared association entity's attributes
            k_1: 'value',
          },
          references: {},
          versions,
        });
      });

      it('does include changes to what entity a shared association references', () => {
        const p1 = new Parent({
          _type: 'Parent',
          id: 'p1',
          shared_text: 'st1',
        });
        const st1 = new SharedText({ _type: 'SharedText', id: 'st1', text: 'text' });
        const st2 = new SharedText({ _type: 'SharedText', id: 'st2', text: 'text' });
        const result = serializeDiff(
          Parent,
          'p1',
          {
            [Parent.storePrefix]: { p1 },
            [SharedText.storePrefix]: { st1 },
          },
          {
            [Parent.storePrefix]: {
              p1: p1.set('shared_text', 'st2'),
            },
            [SharedText.storePrefix]: { st2 },
          },
          { serializeShared: false },
        );

        const st2Ref = Object.keys(result.references)[0];
        expect(result).to.eql({
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

      it('does not include changes to shared entities inside collection associations', () => {
        const p1 = new Parent({
          _type: 'Parent',
          id: 'p1',
          shared_texts: List(['st1']),
        });
        const st1 = new SharedText({ _type: 'SharedText', id: 'st1', text: 'old text' });
        const result = serializeDiff(
          Parent,
          'p1',
          {
            [Parent.storePrefix]: { p1 },
            [SharedText.storePrefix]: { st1 },
          },
          {
            [Parent.storePrefix]: {
              p1: p1.set('k1', 'value'),
            },
            [SharedText.storePrefix]: {
              st1: st1.set('text', 'new text'),
            },
          },
          { serializeShared: false },
        );

        expect(result).to.eql({
          data: {
            _type: 'Parent',
            id: 'p1',
            // Does include change to root entity's attribute, but not to shared association entity's attributes
            k_1: 'value',
          },
          references: {},
          versions,
        });
      });

      it('does include changes to what shared entities are referenced in a collection association', () => {
        const p1 = new Parent({
          _type: 'Parent',
          id: 'p1',
          shared_texts: List(['st1']),
        });
        const st1 = new SharedText({ _type: 'SharedText', id: 'st1', text: 'text' });
        const st2 = new SharedText({ _type: 'SharedText', id: 'st2', text: 'text' });
        const result = serializeDiff(
          Parent,
          'p1',
          {
            [Parent.storePrefix]: { p1 },
            [SharedText.storePrefix]: { st1 },
          },
          {
            [Parent.storePrefix]: {
              p1: p1.set('shared_texts', List(['st1', 'st2'])),
            },
            [SharedText.storePrefix]: { st1, st2 },
          },
          { serializeShared: false },
        );

        const st2Ref = Object.keys(result.references)[0];
        expect(result).to.eql({
          data: {
            _type: 'Parent',
            id: 'p1',
            shared_texts: {
              _type: '_update',
              actions: [
                {
                  _type: 'append',
                  after: {
                    _type: 'SharedText',
                    id: 'st1',
                  },
                  values: [
                    {
                      _ref: st2Ref,
                    },
                  ],
                },
              ],
            },
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

      it.skip('throws an error if you try to create a reference to a polymorphic entity', () => {
        const owner = new PolyOwner({
          _type: 'PolyOwner',
          id: 'owner',
          resource: 'res',
        });

        const res = new PolyEntityImpl({
          _type: 'PolyEntityImpl',
          id: 'res',
          k1: 'something',
          k2: 'a tall mountain',
        });

        expect(
          () => serializeDiff(
            PolyOwner,
            'owner',
            {
              [PolyOwner.storePrefix]: { owner },
              [PolyEntityImpl.storePrefix]: { res },
            },
            {
              [PolyOwner.storePrefix]: { owner },
              [PolyEntityImpl.storePrefix]: {
                res: new PolyEntityImpl({
                  _type: 'PolyEntityImpl',
                  id: 'res',
                  k1: 'something else',
                  k2: 'still a mountain',
                }),
              },
            },
            { serializeShared: false },
          ),
        ).to.throw(ViewModelClientError, /create reference to a polymorphic entity/);
      });

      it('supports maybe shared polymorphic entities', () => {
        const PolyChild = vmClient.defineClass({
          typeName: 'PolyChild',
          version: 1,
          persisted: true,
          attributes: {
            childField: 'string',
          },
        });

        const SharedChild = vmClient.defineClass({
          typeName: 'SharedChild',
          version: 1,
          persisted: true,
          root: true,
          extends: PolyChild,
          attributes: {
            sharedChildField: 'string',
          },
        });

        const OwnedChild = vmClient.defineClass({
          typeName: 'OwnedChild',
          version: 1,
          persisted: true,
          extends: PolyChild,
          attributes: {
            ownedChildField: 'string',
          },
        });

        const PolyParent = vmClient.defineClass({
          typeName: 'PolyParent',
          version: 1,
          persisted: true,
          associations: {
            children: {
              collection: true,
              type: PolyChild,
              shared: 'maybe',
            },
          },
        });

        const shared = new SharedChild({
          id: 'shared',
          childField: 'shared',
          sharedChildField: 'shared',
        });
        const owned = new OwnedChild({
          id: 'owned',
          childField: 'owned',
          ownedChildField: 'owned',
        });
        const parent = new PolyParent({
          id: 'parent',
          children: List([]),
        });

        expect(serializeDiff(
          PolyParent,
          'parent',
          {
            [PolyParent.storePrefix]: { parent: parent.set('children', List([owned.id])) },
            [PolyChild.storePrefix]: { owned },
          },
          {
            [PolyParent.storePrefix]: { parent: parent.set('children', List([owned.id, shared.id])) },
            [PolyChild.storePrefix]: { owned, shared },
          },
          { serializeShared: false },
        )).to.deep.equal({
          data: {
            _type: 'PolyParent',
            children: {
              _type: '_update',
              actions: [
                {
                  _type: 'append',
                  after: {
                    _type: 'OwnedChild',
                    id: 'owned',
                  },
                  values: [
                    {
                      _ref: 'ref1',
                    },
                  ],
                },
              ],
            },
            id: 'parent',
          },
          references: {
            ref1: {
              _type: 'SharedChild',
              id: 'shared',
            },
          },
          versions: {
            OwnedChild: 1,
            PolyChild: 1,
            PolyParent: 1,
            SharedChild: 1,
          },
        });

        expect(serializeDiff(
          PolyParent,
          'parent',
          {
            [PolyParent.storePrefix]: { parent },
            [PolyChild.storePrefix]: {},
          },
          {
            [PolyParent.storePrefix]: { parent: parent.set('children', List([owned.id])) },
            [PolyChild.storePrefix]: { owned },
          },
          { serializeShared: false },
        )).to.deep.equal({
          data: {
            _type: 'PolyParent',
            children: {
              _type: '_update',
              actions: [
                {
                  _type: 'append',
                  values: [
                    {
                      _new: true,
                      _type: 'OwnedChild',
                      owned_child_field: 'owned',
                      child_field: 'owned',
                      id: 'owned',
                    },
                  ],
                },
              ],
            },
            id: 'parent',
          },
          references: {},
          versions: {
            OwnedChild: 1,
            PolyChild: 1,
            PolyParent: 1,
            SharedChild: 1,
          },
        });
      });
    });
  });

  describe('external associations', () => {
    it('diffs the lists', () => {
      const parents = {
        added: new Parent({ _type: 'Parent', id: 'added' }),
        common: new Parent({ _type: 'Parent', id: 'common' }),
        removed: new Parent({ _type: 'Parent', id: 'removed' }),
      };
      const newParents = {
        ...parents,
        common: new Parent({ _type: 'Parent', id: 'common', k1: 'hello' }),
      };
      expect(
        serializeDiff(
          ExternalAssociation,
          'test',
          {
            [Parent.storePrefix]: parents,
            [ExternalAssociation.storePrefix]: {
              test: ['common', 'removed'],
            },
          },
          {
            [Parent.storePrefix]: newParents,
            [ExternalAssociation.storePrefix]: {
              test: ['added', 'common'],
            },
          },
        ),
      ).to.eql({
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
      expect(
        serializeDiff(
          ExternalAssociation,
          'test',
          {
            [ExternalAssociation.storePrefix]: {
              test: ['id1', 'id2'],
            },
          },
          {
            [ExternalAssociation.storePrefix]: {
              test: ['id1', 'id2'],
            },
          },
        ),
      ).to.eql({
        data: null,
        references: {},
        versions,
      });
    });

    it('distinguishes between empty list and undefined', () => {
      // empty list
      expect(
        serializeDiff(
          ExternalAssociation,
          'test',
          {
            [ExternalAssociation.storePrefix]: {
              test: ['id1', 'id2'],
            },
          },
          {
            [ExternalAssociation.storePrefix]: {
              test: [],
            },
          },
        ),
      ).to.eql({
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

      // undefined
      expect(
        serializeDiff(
          ExternalAssociation,
          'test',
          {
            [ExternalAssociation.storePrefix]: {
              test: ['id1', 'id2'],
            },
          },
          {
            [ExternalAssociation.storePrefix]: {},
          },
        ),
      ).to.eql({
        data: null,
        references: {},
        versions,
      });
    });
  });
});

describe('serializeEntity', () => {
  const vmClient = new ViewModelClient();

  const NestedAssociation = vmClient.defineClass({
    typeName: 'NestedAssociation',
    version: 1,
    attributes: {
      k1: 'number',
    },
  });

  const NonSharedAssociation = vmClient.defineClass({
    typeName: 'NonSharedAssociation',
    version: 1,
    associations: {
      nested: NestedAssociation,
    },
  });

  const SharedAssociation = vmClient.defineClass({
    typeName: 'SharedAssociation',
    version: 1,
    associations: {
      nested: {
        type: NestedAssociation,
        shared: true,
      },
    },
  });

  const Entity = vmClient.defineClass({
    typeName: 'Entity',
    version: 1,
    attributes: {
      k1: 'string',
      k2: {
        collection: true,
        type: 'string',
      },
      timestamp: {
        type: Date,
        marshaller: DateMarshaller,
      },
    },
    associations: {
      nonShared: {
        type: NonSharedAssociation,
      },
      shared: {
        shared: true,
        type: SharedAssociation,
      },
      sharedCollection: {
        collection: true,
        shared: true,
        type: SharedAssociation,
      },
    },
  });

  const versions = {
    Entity: 1,
    NestedAssociation: 1,
    NonSharedAssociation: 1,
    SharedAssociation: 1,
  };

  it('serializes data', () => {
    const entity = new Entity({
      k1: 'k1Value',
      k2: List(['k2Value']),
      timestamp: new Date(-1),
    });

    expect(vmClient.serializeEntity(entity)).to.eql({
      data: {
        _type: 'Entity',
        _version: 1,
        k_1: 'k1Value',
        k_2: ['k2Value'],
        timestamp: DateMarshaller.serialize(new Date(-1)),
        shared_collection: [],
      },
      references: {},
      versions,
    });
  });

  it('recursively serializes nested associations', () => {
    const entity = new Entity({
      nonShared: new NonSharedAssociation({
        nested: new NestedAssociation({ k1: 1 }),
      }),
    });

    const result = vmClient.serializeEntity(entity);

    expect(result).to.eql({
      data: {
        _type: 'Entity',
        _version: 1,
        k_2: [],
        non_shared: {
          _type: 'NonSharedAssociation',
          _version: 1,
          nested: {
            _type: 'NestedAssociation',
            _version: 1,
            k_1: 1,
          },
        },
        shared_collection: [],
      },
      references: {},
      versions,
    });
  });

  it('recursively references serialized associations', () => {
    const entity = new Entity({
      shared: new SharedAssociation({
        nested: new NestedAssociation({ k1: 1 }),
      }),
    });

    const result = vmClient.serializeEntity(entity);
    const ref1 = Object.keys(result.references)[0];
    const ref2 = Object.keys(result.references)[1];

    expect(result).to.eql({
      data: {
        _type: 'Entity',
        _version: 1,
        k_2: [],
        shared: { _ref: ref2 },
        shared_collection: [],
      },
      references: {
        [ref1]: {
          _type: 'NestedAssociation',
          _version: 1,
          k_1: 1,
        },
        [ref2]: {
          _type: 'SharedAssociation',
          _version: 1,
          nested: { _ref: ref1 },
        },
      },
      versions,
    });
  });

  it('only creates one reference key for the same reference', () => {
    const nestedAssociation = new NestedAssociation({ k1: 1 });
    const sharedAssociation = new SharedAssociation({ nested: nestedAssociation });

    const entity = new Entity({
      sharedCollection: List([sharedAssociation, sharedAssociation]),
    });

    const result = vmClient.serializeEntity(entity);
    const ref1 = Object.keys(result.references)[0];
    const ref2 = Object.keys(result.references)[1];

    expect(result).to.eql({
      data: {
        _type: 'Entity',
        _version: 1,
        k_2: [],
        shared_collection: [{ _ref: ref2 }, { _ref: ref2 }],
      },
      references: {
        [ref1]: {
          _type: 'NestedAssociation',
          _version: 1,
          k_1: 1,
        },
        [ref2]: {
          _type: 'SharedAssociation',
          _version: 1,
          nested: { _ref: ref1 },
        },
      },
      versions,
    });
  });

  it('operates on lists', () => {
    const data = List([
      new Entity({ k1: 'e1' }),
      new Entity({ k1: 'e2' }),
    ]);

    expect(vmClient.serializeEntity(data)).to.eql({
      data: [
        { _type: 'Entity', _version: 1, k_1: 'e1', k_2: [], shared_collection: [] },
        { _type: 'Entity', _version: 1, k_1: 'e2', k_2: [], shared_collection: [] },
      ],
      references: {},
      versions,
    });
  });

  it('works with undefined values', () => {
    const entity = new Entity({ k2: undefined, sharedCollection: undefined });
    expect(vmClient.serializeEntity(entity)).to.eql({
      data: { _type: 'Entity', _version: 1, k_2: [], shared_collection: [] },
      references: {},
      versions,
    });
  });
});
