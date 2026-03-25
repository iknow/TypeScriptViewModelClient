import { List } from 'immutable';
import { expect } from 'chai';
import { DateMarshaller } from '../tests/shared';
import { AssignmentError, CollectionError, NotNullError, SharedReferenceError } from './validate';
import { TypeRegistryError } from '../utils/TypeRegistry';
import ViewModelClient from '../';

describe('remote/recordize', () => {
  const vmClient = new ViewModelClient();

  const Target = vmClient.defineClass({
    typeName: 'Target',
    version: 2,
    persisted: true,
  });

  const Child = vmClient.defineClass({
    typeName: 'Child',
    version: 1,
    storePrefix: 'children',
    persisted: true,
  });

  const SharedText = vmClient.defineClass({
    typeName: 'SharedText',
    version: 1,
    persisted: true,
    attributes: {
      text: 'string',
    },
  });

  const Parent = vmClient.defineClass({
    typeName: 'Parent',
    version: 1,
    persisted: true,
    associations: {
      children: [Child],
      target: Target,
      sharedText: {
        type: SharedText,
        shared: true,
      },
    },
  });

  vmClient.defineClass({
    typeName: 'Validation',
    version: 1,
    persisted: true,
    attributes: {
      k1: {
        type: 'string',
        notNull: true,
      },
      k2: {
        type: 'string',
        collection: true,
        notNull: true,
      },
    },
    associations: {
      k3: {
        type: Child,
        notNull: true,
      },
      k4: {
        type: Child,
        collection: true,
        notNull: true,
      },
    },
  });

  vmClient.defineClass({
    typeName: 'DateThing',
    version: 1,
    persisted: true,
    attributes: {
      timestamp: {
        type: Date,
        marshaller: DateMarshaller,
      },
      timestamps: {
        type: Date,
        marshaller: DateMarshaller,
        collection: true,
      },
    },
  });

  const NonPersistedEntity = vmClient.defineClass({
    typeName: 'NonPersistedEntity',
    version: 1,
    attributes: {
      fieldA: 'string',
    },
  });

  it('works with non persisted entities', () => {
    const data = {
      _type:    'NonPersistedEntity',
      _version: 1,
      field_a:  'text',
    };

    const expected = new NonPersistedEntity({ id: 'parent1', fieldA: 'text' });

    expect(vmClient.recordize({ data })).to.eql(expected);
  });

  it('recursively creates records of appropriate types', () => {
    const data = {
      id:       'parent1',
      _type:    'Parent',
      _version: 1,
      target:   { id: 'target1', _type: 'Target', _version: 2 },
      children: [
        { id: 'child1', _type: 'Child', _version: 1 },
        { id: 'child2', _type: 'Child', _version: 1 },
      ],
      shared_text: null,
    };

    const references = {};

    expect(vmClient.recordize({ data, references })).to.eql(
      Parent({
        id:       'parent1',
        _type:    'Parent',
        _version: 1,
        target:   Target({
          id:       'target1',
          _type:    'Target',
          _version: 2,
        }),
        children: List([
          Child({ id: 'child1', _type: 'Child', _version: 1 }),
          Child({ id: 'child2', _type: 'Child', _version: 1 }),
        ]),
        sharedText: null,
      }),
    );
  });

  it('inlines ref trees, with sharing', () => {
    const data = [
      {
        _type:       'Parent',
        _version:    1,
        id:          'parent1',
        children:    [],
        target:      null,
        shared_text: { _ref: 'stref001' },
      },
      {
        _type:       'Parent',
        _version:    1,
        id:          'parent2',
        children:    [],
        target:      null,
        shared_text: { _ref: 'stref001' },
      },
    ];

    const references = {
      stref001: {
        _type:    'SharedText',
        _version: 1,
        id:       'sharedtext1',
        text:     'Shared Text 1',
      },
    };

    const result = vmClient.recordize({ data, references });

    expect(result).to.eql(List([
      new Parent({
        _type:      'Parent',
        _version:   1,
        id:         'parent1',
        children:   List(),
        target:     null,
        sharedText: new SharedText({
          _type:    'SharedText',
          _version: 1,
          id:       'sharedtext1',
          text:     'Shared Text 1',
        }),
      }),
      new Parent({
        _type:      'Parent',
        _version:   1,
        id:         'parent2',
        children:   List(),
        target:     null,
        sharedText: new SharedText({
          _type:    'SharedText',
          _version: 1,
          id:       'sharedtext1',
          text:     'Shared Text 1',
        }),
      }),
    ]));

    const [p1, p2] = result;

    expect(p1.sharedText).to.equal(p2.sharedText);
  });

  it('applies type based deserialization', () => {
    const data = {
      _type:           'DateThing',
      _version:        1,
      id:              'thing1',
      timestamp:   '1941-09-09T13:37:00.000Z',
      timestamps: [
        '1903-04-23T13:37:00.000Z',
        '1912-07-23T13:37:00.000Z',
      ],
    };

    const result = vmClient.recordize({ data });

    const { timestamp, timestamps } = result;

    expect(timestamp).to.eql(new Date(-893413380000));
    expect(timestamps).to.eql(List.of(
      new Date(-2104654980000),
      new Date(-1812709380000),
    ));
  });

  describe('validation', () => {
    const data = {
      _type: 'Validation',
      _version: 1,
      id: 'v1',
      k_1: '',
      k_2: [],
      k_3: {
        id: 'child1',
        _type: 'Child',
        _version: 1,
      },
      k_4: [{
        id: 'child2',
        _type: 'Child',
        _version: 1,
      }],
    };

    it('throws when version mismatches', () => {
      expect(
        () => vmClient.recordize({ data: { ...data, _version: 2 } }),
      ).to.throw(TypeRegistryError);
    });

    it('throws when association type is incorrect', () => {
      [
        { data: { ...data, k_3: { _type: 'Target', _version: 2, id: 't1' } } },
        { data: { ...data, k_4: [{ _type: 'Target', _version: 2, id: 't1' }] } },
      ].forEach((response) => {
        expect(
          () => vmClient.recordize(response),
        ).to.throw(AssignmentError);
      });
    });

    it('throws error when null is returned for notNull type', () => {
      [
        { data: { ...data, k_1: null } },
        { data: { ...data, k_2: null } },
        { data: { ...data, k_3: null } },
        { data: { ...data, k_4: null } },
      ].forEach((response) => {
        expect(
          () => vmClient.recordize(response),
        ).to.throw(NotNullError);
      });
    });

    it('throws when type unexpectedly returns a collection', () => {
      [
        { data: { ...data, k_1: [] } },
        { data: { ...data, k_3: [] } },
      ].forEach((response) => {
        expect(() => vmClient.recordize(response)).to.throw(CollectionError);
      });
    });

    it('throws when type unexpectedly is not a collection', () => {
      [
        { data: { ...data, k_2: '' } },
        { data: { ...data, k_4: '' } },
      ].forEach((response) => {
        expect(() => vmClient.recordize(response)).to.throw(CollectionError);
      });
    });

    it('throws when shared associations are nested in the data tree (no references)', () => {
      expect(
        () => vmClient.recordize({
          data: {
            _type:       'Parent',
            _version: 1,
            id:          'parent1',
            children: [],
            target: null,
            shared_text: {
              _type: 'SharedText',
              _version: 1,
              id:    'sharedtext1',
              text:  'Shared Text 1',
            },
          },
        }),
      ).to.throw(SharedReferenceError);
    });
  });
});
