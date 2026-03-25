import { expect } from 'chai';
import { List } from 'immutable';
import * as v from '../index';
import DateCodec from '../codecs/DateCodec';

describe('encodeRequest', () => {
  // These tests mainly serve as demonstrations of the differences between all
  // of the supported ways of encoding entities.
  describe('supports different ways of encoding entities', () => {
    const Entity = v.entityConstructor({
      typeName: 'Entity',
      version: 1,
      fields: {
        id: v.opt(v.string),
        field: v.string,
      },
    });
    const entity = new Entity({
      id: 'id',
      field: 'test',
    });
    const decodedEntity = Entity.decodedEntity({
      id: 'id',
      field: 'test',
    });
    const decodedHandle = new v.DecodedHandle(Entity, decodedEntity);
    const versions = {
      [Entity.typeName]: Entity.version,
    };
    const encodedEntityTypeAndId = {
      id: 'id',
      _type: 'Entity',
    };
    const encodedEntity = {
      ...encodedEntityTypeAndId,
      field: 'test',
    };

    it('encodes nested entities', () => {
      expect(v.encodeRequest({
        codec: v.nested(Entity),
        value: entity,
      })).to.deep.equal({
        data: encodedEntity,
        references: {},
        versions,
      });
    });

    it('encodes the type+ID of entities in references', () => {
      expect(v.encodeRequest({
        codec: v.ref(v.nested(Entity)),
        value: entity,
      })).to.deep.equal({
        data: { _ref: 'ref0' },
        references: {
          ref0: encodedEntityTypeAndId,
        },
        versions,
      });
    });

    it('encodes full entities in references', () => {
      expect(v.encodeRequest({
        codec: v.encodedRef(v.nested(Entity)),
        value: entity,
      })).to.deep.equal({
        data: { _ref: 'ref0' },
        references: {
          ref0: encodedEntity,
        },
        versions,
      });
    });

    it('encodes handles as nested entities', () => {
      expect(v.encodeRequest({
        codec: v.handle(Entity),
        value: decodedHandle,
      })).to.deep.equal({
        data: encodedEntity,
        references: {},
        versions,
      });
    });

    it('encodes handles as a type+ID in references', () => {
      expect(v.encodeRequest({
        codec: v.refHandle(Entity),
        value: decodedHandle,
      })).to.deep.equal({
        data: { _ref: 'ref0' },
        references: {
          ref0: encodedEntityTypeAndId,
        },
        versions,
      });
    });

    it('encodes handles as full entities in references', () => {
      expect(v.encodeRequest({
        codec: v.encodedRefHandle(Entity),
        value: decodedHandle,
      })).to.deep.equal({
        data: { _ref: 'ref0' },
        references: {
          ref0: encodedEntity,
        },
        versions,
      });
    });

    it('encodes handles as the type+ID of a different type of entity in references', () => {
      const EntityWithSameBackingModel = v.entityConstructor({
        typeName: 'EntityWithSameBackingModel',
        version: 1,
        fields: {
          id: v.opt(v.string),
          otherField: v.string,
        },
      });

      expect(v.encodeRequest({
        // There is intentionally no "encoded" version of `assertedRefHandle`,
        // because it is only for cases where it is okay to use the same ID
        // because the different viewmodels are backed by the same backend
        // model/DB table. Other than the ID, the two viewmodels may have
        // different fields and are not necessarilly interchangeable.
        //
        // In theory there could be an `assertedRef` codec that has the same
        // behavior but does not use handles, but there hasn't been a need for
        // it so far.
        codec: v.assertedRefHandle(Entity, [EntityWithSameBackingModel]),
        value: new v.DecodedHandle(EntityWithSameBackingModel, EntityWithSameBackingModel.decodedEntity({
          id: 'id',
          otherField: 'otherField',
        })),
      })).to.deep.equal({
        data: { _ref: 'ref0' },
        references: {
          ref0: {
            _type: 'Entity',
            id: 'id',
          },
        },
        versions,
      });
    });
  });

  it('can encode nested root entities', () => {
    const NestedRoot = v.entity({
      typeName: 'NestedRoot',
      version: 1,
      fields: {
        id: v.opt(v.string),
      },
    });
    type NestedRoot = v.TypeOf<typeof NestedRoot>;

    const Parent = v.entity({
      typeName: 'Parent',
      version: 1,
      fields: {
        nestedRoot: v.encodedRef(NestedRoot),
      },
    });
    type Parent = v.TypeOf<typeof Parent>;

    const encodedRequest = v.encodeRequest({
      codec: Parent,
      value: {
        _type: 'Parent',
        nestedRoot: {
          _type: 'NestedRoot',
          id: 'nested-root',
        },
      },
    });
    const ref = Object.keys(encodedRequest.references)[0];

    expect(typeof ref === 'string' && ref.length > 0, 'is a non-empty string').to.be.true;

    expect(encodedRequest).to.deep.equal({
      data: {
        _type: 'Parent',
        nested_root: {
          _ref: ref,
        },
      },
      references: {
        [ref]: {
          _type: 'NestedRoot',
          id: 'nested-root',
        },
      },
      versions: {
        NestedRoot: 1,
        Parent: 1,
      },
    });
  });

  it('can encode nested unioned root entities', () => {
    const NestedRoot = v.entity({
      typeName: 'NestedRoot',
      version: 1,
      fields: {
        id: v.opt(v.string),
      },
    });
    type NestedRoot = v.TypeOf<typeof NestedRoot>;

    const NestedRootAlt = v.entity({
      typeName: 'NestedRootAlt',
      version: 1,
      fields: {
        id: v.opt(v.string),
        someValue: v.number,
      },
    });
    type NestedRootAlt = v.TypeOf<typeof NestedRootAlt>;

    const Parent = v.entity({
      typeName: 'Parent',
      version: 1,
      fields: {
        nestedRoot: v.union([
          // The order should not matter, because _type is used to discriminate
          // between the entity types.
          v.encodedRef(NestedRoot),
          v.encodedRef(NestedRootAlt),
        ]),
      },
    });
    type Parent = v.TypeOf<typeof Parent>;

    const encodedRequest = v.encodeRequest({
      codec: Parent,
      value: {
        _type: 'Parent',
        nestedRoot: {
          _type: 'NestedRootAlt',
          id: 'nested-root',
          someValue: 1,
        },
      },
    });
    const ref = Object.keys(encodedRequest.references)[0];

    expect(typeof ref === 'string' && ref.length > 0, 'is a non-empty string').to.be.true;

    expect(encodedRequest).to.deep.equal({
      data: {
        _type: 'Parent',
        nested_root: {
          _ref: ref,
        },
      },
      references: {
        [ref]: {
          _type: 'NestedRootAlt',
          id: 'nested-root',
          some_value: 1,
        },
      },
      versions: {
        NestedRoot: 1,
        Parent: 1,
        NestedRootAlt: 1,
      },
    });
  });

  it('has return value assignable to Record<string, unknown>', () => {
    // This test is just for verifying the types are correct, and not for
    // testing runtime behavior.
    const request: Record<string, unknown> = v.encodeRequest({
      codec: v.number,
      value: 1,
    });
    // Silence unused variable warning.
    return request;
  });

  it('does not set the new flag', () => {
    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        id: v.string,
        k1: v.string,
        k2: v.string,
      },
    });

    expect(v.encodeRequest({
      codec: v.nullable(v.nested(Parent)),
      value: new Parent({ id: 'p1', k1: 'v', k2: 'vnew' }),
    })).to.deep.equal({
      data: {
        _type: 'Parent',
        id: 'p1',
        k_1: 'v',
        k_2: 'vnew',
      },
      references: {},
      versions: {
        Parent: 1,
      },
    });
  });

  it('allows explicitly setting the new flag', () => {
    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        id: v.string,
      },
    });

    expect(v.encodeRequest({
      codec: v.nullable(v.nested(Parent)),
      value: new Parent({ _new: true, id: 'p1' }),
    })).to.deep.equal({
      data: {
        _type: 'Parent',
        _new: true,
        id: 'p1',
      },
      references: {},
      versions: {
        Parent: 1,
      },
    });
  });

  it('encodes readOnly fields to undefined', () => {
    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        k1: v.readOnly(v.string),
      },
    });

    expect(v.encodeRequest({
      codec: v.nested(Parent),
      value: new Parent({ k1: 'v' }),
    })).to.deep.equal({
      data: {
        _type: 'Parent',
      },
      references: {},
      versions: {
        Parent: 1,
      },
    });
  });

  it('does not encode readOnly field when setting to undefined', () => {
    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        k1: v.readOnly(v.string),
      },
    });

    expect(v.encodeRequest({
      codec: v.nested(Parent),
      value: new Parent({ k1: undefined }),
    })).to.deep.equal({
      data: {
        _type: 'Parent',
      },
      references: {},
      versions: {
        Parent: 1,
      },
    });
  });

  it('allows encoding writeOnly field', () => {
    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        k1: v.writeOnly(v.string),
      },
    });

    expect(v.encodeRequest({
      codec: v.nested(Parent),
      value: new Parent({ k1: 'test' }),
    })).to.deep.equal({
      data: {
        _type: 'Parent',
        k_1: 'test',
      },
      references: {},
      versions: {
        Parent: 1,
      },
    });
  });

  it('omits writeOnce fields when editing existing entity', () => {
    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        id: v.opt(v.string),
        k1: v.writeOnce(v.string),
      },
    });
    expect(v.encodeRequest({
      codec: v.nested(Parent),
      value: new Parent({ id: 'parent-id', k1: 'test' }),
    })).to.deep.equal({
      data: {
        _type: 'Parent',
        id: 'parent-id',
      },
      references: {},
      versions: {
        Parent: 1,
      },
    });
  });

  it('does not omit writeOnce fields when creating new entity', () => {
    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        id: v.opt(v.string),
        k1: v.writeOnce(v.string),
      },
    });
    expect(v.encodeRequest({
      codec: v.nested(Parent),
      value: new Parent({ id: undefined, k1: 'test' }),
    })).to.deep.equal({
      data: {
        _type: 'Parent',
        k_1: 'test',
      },
      references: {},
      versions: {
        Parent: 1,
      },
    });
  });

  describe('DecodedHandle', () => {
    const Entity = v.entityConstructor({
      typeName: 'Entity',
      version: 1,
      fields: {
        id: v.string,
      },
    });

    const expectedOutput = {
      data: {
        _type: 'Entity',
        id: 'test',
      },
      references: {},
      versions: {
        Entity: 1,
      },
    };

    it('can encode using a DecodedHandle', () => {
      expect(v.encodeRequest({
        codec: v.handle(Entity),
        value: new v.DecodedHandle(Entity, Entity.decodedEntity({ id: 'test' })),
      })).to.deep.equal(expectedOutput);
    });

    it('can encode using a Handle + EntityDB', () => {
      expect(v.encodeRequest({
        codec: v.handle(Entity),
        value: v.Handle.dangerouslyCreateFromTypeAndId(Entity, 'test'),
        entityDb: v.EntityDB.emptyDb.setEntity(new Entity({ id: 'test' })),
      })).to.deep.equal(expectedOutput);
    });
  });

  describe('view-model tests', () => {
    const NestedAssociation = v.entityConstructor({
      typeName: 'NestedAssociation',
      version: 1,
      fields: {
        k1: v.nullable(v.number),
      },
    });

    const NonSharedAssociation = v.entityConstructor({
      typeName: 'NonSharedAssociation',
      version: 1,
      fields: {
        nested: v.nullable(v.nested(NestedAssociation)),
      },
    });

    const NestedSharedAssociation = v.entityConstructor({
      typeName: 'NestedSharedAssociation',
      version: 1,
      fields: {
        id: v.opt(v.string),
        k1: v.nullable(v.number),
      },
    });

    const SharedAssociation = v.entityConstructor({
      typeName: 'SharedAssociation',
      version: 1,
      fields: {
        id: v.opt(v.string),
        nested: v.nullable(v.encodedRef(v.nested(NestedSharedAssociation))),
      },
    });

    const Entity = v.entityConstructor({
      typeName: 'Entity',
      version: 1,
      fields: {
        k1: v.union([v.string, v.null, v.undefined]),
        k2: v.union([v.list(v.string), v.undefined]),
        timestamp: v.union([DateCodec, v.undefined]),
        nonShared: v.union([v.nested(NonSharedAssociation), v.null, v.undefined]),
        shared: v.union([v.encodedRef(v.nested(SharedAssociation)), v.null, v.undefined]),
        sharedCollection: v.union([v.list(v.encodedRef(v.nested(SharedAssociation))), v.undefined]),
      },
    });

    const emptyEntity = new Entity({
      k1: undefined,
      k2: List(),
      timestamp: undefined,
      nonShared: undefined,
      shared: undefined,
      sharedCollection: List(),
    });
    const emptyEntityEncoded = {
      _type: 'Entity',
      k_2: [],
      shared_collection: [],
    };

    const versions = {
      Entity: 1,
      NestedAssociation: 1,
      NestedSharedAssociation: 1,
      NonSharedAssociation: 1,
      SharedAssociation: 1,
    };

    it('serializes data', () => {
      const entity = emptyEntity.merge({
        k1: 'k1Value',
        k2: List(['k2Value']),
        timestamp: new Date(-1),
        sharedCollection: List(),
      });

      expect(v.encodeRequest({
        value: entity,
        codec: v.nested(Entity),
      })).to.deep.equal({
        data: {
          ...emptyEntityEncoded,
          k_1: 'k1Value',
          k_2: ['k2Value'],
          timestamp: (new Date(-1)).toJSON(),
        },
        references: {},
        versions,
      });
    });

    it('recursively serializes nested associations', () => {
      const entity = emptyEntity.merge({
        nonShared: new NonSharedAssociation({
          nested: new NestedAssociation({ k1: 1 }),
        }),
      });

      const result = v.encodeRequest({
        value: entity,
        codec: v.nested(Entity),
      });

      expect(result).to.deep.equal({
        data: {
          ...emptyEntityEncoded,
          non_shared: {
            _type: 'NonSharedAssociation',
            nested: {
              _type: 'NestedAssociation',
              k_1: 1,
            },
          },
        },
        references: {},
        versions,
      });
    });

    it('recursively references serialized associations', () => {
      const entity = emptyEntity.merge({
        shared: new SharedAssociation({
          id: undefined,
          nested: new NestedSharedAssociation({ id: undefined, k1: 1 }),
        }),
      });

      const result = v.encodeRequest({
        value: entity,
        codec: v.nested(Entity),
      });
      const ref1 = Object.keys(result.references)[0];
      const ref2 = Object.keys(result.references)[1];

      expect(result).to.deep.equal({
        data: {
          ...emptyEntityEncoded,
          shared: { _ref: ref2 },
        },
        references: {
          [ref1]: {
            _type: 'NestedSharedAssociation',
            k_1: 1,
          },
          [ref2]: {
            _type: 'SharedAssociation',
            nested: { _ref: ref1 },
          },
        },
        versions,
      });
    });

    it('only creates one reference key for the same reference', () => {
      const nestedAssociation = new NestedSharedAssociation({ id: 'id-nested', k1: 1 });
      const sharedAssociation = new SharedAssociation({ id: 'id-shared', nested: nestedAssociation });

      const entity = emptyEntity.merge({
        sharedCollection: List([sharedAssociation, sharedAssociation]),
      });

      const result = v.encodeRequest({
        value: entity,
        codec: v.nested(Entity),
      });
      const ref1 = Object.keys(result.references)[0];
      const ref2 = Object.keys(result.references)[1];

      expect(result).to.deep.equal({
        data: {
          ...emptyEntityEncoded,
          shared_collection: [{ _ref: ref2 }, { _ref: ref2 }],
        },
        references: {
          [ref1]: {
            _type: 'NestedSharedAssociation',
            id: 'id-nested',
            k_1: 1,
          },
          [ref2]: {
            _type: 'SharedAssociation',
            id: 'id-shared',
            nested: { _ref: ref1 },
          },
        },
        versions,
      });
    });

    it('does not create one reference key for the same reference when ID is undefined', () => {
      const nestedAssociation = new NestedSharedAssociation({ id: undefined, k1: 1 });
      const sharedAssociation = new SharedAssociation({ id: undefined, nested: nestedAssociation });

      const entity = emptyEntity.merge({
        sharedCollection: List([sharedAssociation, sharedAssociation]),
      });

      const result = v.encodeRequest({
        value: entity,
        codec: v.nested(Entity),
      });
      const ref1 = Object.keys(result.references)[0];
      const ref2 = Object.keys(result.references)[1];
      const ref3 = Object.keys(result.references)[2];
      const ref4 = Object.keys(result.references)[3];

      expect(result).to.deep.equal({
        data: {
          ...emptyEntityEncoded,
          _type: 'Entity',
          shared_collection: [{ _ref: ref2 }, { _ref: ref4 }],
        },
        references: {
          [ref1]: {
            _type: 'NestedSharedAssociation',
            k_1: 1,
          },
          [ref2]: {
            _type: 'SharedAssociation',
            nested: { _ref: ref1 },
          },
          [ref3]: {
            _type: 'NestedSharedAssociation',
            k_1: 1,
          },
          [ref4]: {
            _type: 'SharedAssociation',
            nested: { _ref: ref3 },
          },
        },
        versions,
      });
    });

    it('operates on lists', () => {
      const value = List([
        emptyEntity.merge({ k1: 'e1' }),
        emptyEntity.merge({ k1: 'e2' }),
      ]);

      expect(v.encodeRequest({
        value,
        codec: v.list(v.nested(Entity)),
      })).to.deep.equal({
        data: [
          { ...emptyEntityEncoded, k_1: 'e1' },
          { ...emptyEntityEncoded, k_1: 'e2' },
        ],
        references: {},
        versions,
      });
    });

    it('works with undefined values', () => {
      const entity = emptyEntity.merge({ k2: undefined, sharedCollection: undefined });
      expect(v.encodeRequest({
        value: entity,
        codec: v.nested(Entity),
      })).to.deep.equal({
        data: { _type: 'Entity' },
        references: {},
        versions,
      });
    });
  });
});
