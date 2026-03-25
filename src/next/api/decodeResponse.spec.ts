import { expect } from 'chai';
import { List } from 'immutable';
import * as EitherFP from 'fp-ts/lib/Either';
import * as v from '../index';
import DateCodec from '../codecs/DateCodec';

describe('decodeResponse', () => {
  // These tests mainly serve as demonstrations of the differences between all
  // of the supported ways of decoding entities.
  describe('supports different ways of decoding entities', () => {
    const Entity = v.entityConstructor({
      typeName: 'Entity',
      version: 1,
      fields: {
        id: v.opt(v.string),
        field: v.string,
      },
    });
    const decodedEntity = Entity.decodedEntity({
      id: 'id',
      field: 'test',
    });
    const decodedHandle = new v.DecodedHandle(Entity, decodedEntity);

    it('decodes nested entities', () => {
      expect(v.decodeResponse({
        codec: v.nested(Entity),
        response: {
          data: {
            id: 'id',
            _type: 'Entity',
            _version: 1,
            field: 'test',
          },
        },
      }).data).to.deep.equal(decodedEntity);
    });

    it('decodes entities in references', () => {
      expect(v.decodeResponse({
        // For decoding `ref` and `encodedRef` behave the same.
        codec: v.ref(v.nested(Entity)),
        response: {
          data: { _ref: 'ref0' },
          references: {
            ref0: {
              id: 'id',
              _type: 'Entity',
              _version: 1,
              field: 'test',
            },
          },
        },
      }).data).to.deep.equal(decodedEntity);
    });

    it('decodes nested entities as handles', () => {
      expect(v.decodeResponse({
        codec: v.handle(Entity),
        response: {
          data: {
            id: 'id',
            _type: 'Entity',
            _version: 1,
            field: 'test',
          },
        },
      }).data).to.deep.equal(decodedHandle);
    });

    it('decodes entities in references as handles', () => {
      expect(v.decodeResponse({
        // For decoding, `refHandle`, `encodedRefHandle`, and `assertedRefHandle` all behave the same.
        codec: v.refHandle(Entity),
        response: {
          data: { _ref: 'ref0' },
          references: {
            ref0: {
              id: 'id',
              _type: 'Entity',
              _version: 1,
              field: 'test',
            },
          },
        },
      }).data).to.deep.equal(decodedHandle);
    });
  });

  it('handles union list associations', () => {
    const Child = v.entityConstructor({
      typeName: 'Child',
      version: 1,
      fields: {
        id: v.opt(v.string),
        childField: v.string,
      },
    });

    const OtherChild = v.entityConstructor({
      typeName: 'OtherChild',
      version: 1,
      fields: {
        id: v.opt(v.string),
        otherChildField: v.string,
      },
    });

    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        id: v.opt(v.string),
        children: v.associationList(
          v.union([v.handle(Child), v.handle(OtherChild)]),
        ),
      },
    });

    const data = {
      id: 'parent1',
      _type: 'Parent',
      _version: 1,
      children: [{
        id: 'child1',
        _type: 'Child',
        _version: 1,
        child_field: 'test',
      }, {
        id: 'child2',
        _type: 'OtherChild',
        _version: 1,
        other_child_field: 'test',
      }],
    };
    const response = { data };

    const expectedEntityDb = (
      v.EntityDB.emptyDb
      .setEntity(new Parent({
        id: 'parent1',
        children: List([
          v.Handle.dangerouslyCreateFromTypeAndId(Child, 'child1'),
          v.Handle.dangerouslyCreateFromTypeAndId(OtherChild, 'child2'),
        ]),
      }))
      .setEntity(new Child({
        id: 'child1',
        childField: 'test',
      }))
      .setEntity(new OtherChild({
        id: 'child2',
        otherChildField: 'test',
      }))
    );

    const { entityDb } = v.decodeResponse({
      response,
      codec: v.handle(Parent),
    });
    expect(entityDb.toJS()).to.deep.equal(expectedEntityDb.toJS());
  });

  it('supports recursion', () => {
    interface IParent extends v.IFields {
      field: v.ViewModelCodec<string>;
      children: v.ViewModelCodec<
        Array<v.ReadonlyEntity<v.IEntityConstructor<IParent, 'Parent'>>>,
        unknown,
        Array<v.DecodedEntity<v.IEntityConstructor<IParent, 'Parent'>>>
      >;
    }

    const Parent: v.IEntityConstructor<IParent, 'Parent'> = v.entityConstructor<IParent, 'Parent'>({
      typeName: 'Parent',
      version: 1,
      fields: {
        field: v.string,
        children: v.array(
          v.lazy('Parent', () => v.nested(Parent)),
        ),
      },
    });

    const data = {
      _type: 'Parent',
      _version: 1,
      field: 'test1',
      children: [{
        _type: 'Parent',
        _version: 1,
        field: 'test2',
        children: [{
          _type: 'Parent',
          _version: 1,
          field: 'test3',
          children: [],
        }],
      }],
    };
    const response = { data };

    const rootEntity = v.decodeResponse({
      response,
      codec: v.nested(Parent),
    }).data;

    expect(rootEntity.field).to.equal('test1');
    expect(rootEntity.children[0].field).to.equal('test2');
    expect(rootEntity.children[0].children[0].field).to.equal('test3');
  });

  it('supports nested entities', () => {
    const Child = v.entityConstructor({
      typeName: 'Child',
      version: 1,
      fields: {
        field: v.string,
      },
    });

    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        children: v.array(v.nested(Child)),
      },
    });

    const data = {
      _type: 'Parent',
      _version: 1,
      children: [{
        _type: 'Child',
        _version: 1,
        field: 'test',
      }],
    };
    const response = { data };

    const rootEntity = v.decodeResponse({
      response,
      codec: v.nested(Parent),
    }).data;

    expect(rootEntity.children[0].field).to.equal('test');
  });

  it('returns meta fields', () => {
    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {},
    });

    const data = {
      _type: 'Parent',
      _version: 1,
      _migrated: true,
    };
    const response = { data };

    const rootEntity = v.decodeResponse({
      response,
      codec: v.nested(Parent),
    }).data;

    const typeName: 'Parent' = rootEntity[v.ViewModelFields.Type];
    expect(typeName).to.equal('Parent');
    expect(rootEntity[v.ViewModelFields.Migrated]).to.equal(true);
  });

  it('reuses ref if multiple codecs reference the same root entity', () => {
    const Child = v.entityConstructor({
      typeName: 'Child',
      version: 1,
      fields: {
        id: v.opt(v.string),
        childField: v.string,
      },
    });

    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        id: v.opt(v.string),
        child: v.refHandle(Child),
        children: v.associationList(v.refHandle(Child)),
      },
    });

    const data = {
      id: 'parent1',
      _type: 'Parent',
      _version: 1,
      child: {
        _ref: 'ref1',
      },
      children: [{ _ref: 'ref1' }, { _ref: 'ref2' }],
    };

    const references = {
      ref1: {
        id: 'child1',
        _type: 'Child',
        _version: 1,
        child_field: 'childField1',
      },
      ref2: {
        id: 'child2',
        _type: 'Child',
        _version: 1,
        child_field: 'childField2',
      },
    };

    const child1 = Child.decodedEntity({
      id: 'child1',
      childField: 'childField1',
    });
    const child2 = Child.decodedEntity({
      id: 'child2',
      childField: 'childField2',
    });
    const child1Handle = new v.DecodedHandle(Child, child1);
    const child2Handle = new v.DecodedHandle(Child, child2);

    const expectedEntityDb = (
      v.EntityDB.emptyDb
      .setEntity(new Parent({
        id: 'parent1',
        child: child1Handle,
        children: List([
          child1Handle,
          child2Handle,
        ]),
      }))
      .setEntity(child1)
      .setEntity(child2)
    );

    const { entityDb } = v.decodeResponse({
      response: { data, references },
      codec: v.handle(Parent),
    });
    expect(entityDb.toJS()).to.deep.equal(expectedEntityDb.toJS());
  });

  it('does not keep entities from failed union branches', () => {
    const Child = v.entityConstructor({
      typeName: 'Child',
      version: 1,
      fields: {
        id: v.union([v.opt(v.string), v.opt(v.number)]),
      },
    });

    const childrenCodec = v.associationList(v.handle(Child));

    const allNumericCodec = new v.ViewModelCodec({
      ...childrenCodec,
      validateWithState: (input, context, state) => {
        const childrenEither = childrenCodec.validateWithState(input, context, state);
        if (EitherFP.isLeft(childrenEither)) {
          return childrenEither;
        }

        const list = childrenEither.right;
        if (!list.every((child) => typeof child.id === 'number')) {
          return EitherFP.left([{
            value: list,
            context,
            message: 'Expected only numeric IDs',
          }]);
        }

        return EitherFP.right(list);
      },
    });

    const filterNumericCodec = new v.ViewModelCodec({
      ...childrenCodec,
      validateWithState: (input, context, state) => {
        let filteredInput = input;
        if (Array.isArray(input)) {
          // Important: Filter the data before calling validateWithState, so the
          // non-numeric child is never decoded and never put in the EntityDB.
          filteredInput = input.filter((child: unknown) => {
            return typeof child === 'object' && child !== null && 'id' in child && typeof child.id === 'number';
          });
        }

        return childrenCodec.validateWithState(filteredInput, context, state);
      },
    });

    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 1,
      fields: {
        id: v.opt(v.string),
        children: v.union([allNumericCodec, filterNumericCodec]),
      },
    });

    const data = {
      id: 'parent1',
      _type: 'Parent',
      _version: 1,
      children: [{
        id: 1,
        _type: 'Child',
        _version: 1,
      }, {
        id: 'child2',
        _type: 'Child',
        _version: 1,
      }],
    };
    const response = { data };

    const expectedEntityDb = (
      v.EntityDB.emptyDb
      .setEntity(new Parent({
        id: 'parent1',
        children: List([
          v.Handle.dangerouslyCreateFromTypeAndId(Child, 1),
        ]),
      }))
      .setEntity(new Child({
        id: 1,
      }))
    );

    const { entityDb } = v.decodeResponse({
      response,
      codec: v.handle(Parent),
    });
    expect(entityDb.toJS()).to.deep.equal(expectedEntityDb.toJS());
  });

  describe('mapped()', () => {
    it('supports overriding local constructor type', () => {
      const Child = v.entityConstructor({
        typeName: 'Child',
        version: 1,
        fields: {
          id: v.opt(v.string),
          field: v.string,
        },
      });
      type Child = InstanceType<typeof Child>;
      const ChildId = v.entityConstructor({
        typeName: Child.typeName,
        version: Child.version,
        fields: {
          id: Child.fields.id,
        },
      });
      type ChildId = InstanceType<typeof ChildId>;

      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          children: v.array(
            v.mapped({
              codec: v.nested(ChildId),
              beforeEncode: ({ id }: Child | ChildId) => new ChildId({ id }),
              afterDecode: (x) => x,
            }),
          ),
        },
      });

      expect(() => new Parent({
        children: [new Child({ id: '1', field: 'test' })],
      })).to.not.throw;
      expect(() => new Parent({
        children: [new ChildId({ id: '1' })],
      })).to.not.throw;
    });

    it('supports overriding local constructor type with handles', () => {
      const Child = v.entityConstructor({
        typeName: 'Child',
        version: 1,
        fields: {
          id: v.opt(v.string),
          field: v.string,
        },
      });
      const ChildId = v.entityConstructor({
        typeName: Child.typeName,
        version: Child.version,
        fields: {
          id: Child.fields.id,
        },
      });

      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          children: v.array(
            v.mapped({
              codec: v.handle(ChildId),
              beforeEncode: ({ id }: v.Handle<typeof Child> | v.Handle<typeof ChildId>): v.Handle<typeof ChildId> =>
                v.Handle.dangerouslyCreateFromTypeAndId(ChildId, id),
              afterDecode: (x) => x,
            }),
          ),
        },
      });

      expect(() => new Parent({
        children: [v.Handle.dangerouslyCreateFromTypeAndId(Child, '1')],
      })).to.not.throw;
      expect(() => new Parent({
        children: [v.Handle.dangerouslyCreateFromTypeAndId(ChildId, '1')],
      })).to.not.throw;
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

    const { data, entityDb } = v.decodeResponse({
      response: {
        data: {
          _type: 'Entity',
          _version: 1,
          id: 'test',
        },
      },
      codec: v.handle(Entity),
    });

    it('returns the entity via both a DecodedHandle and via the entityDb', () => {
      // Construct a `Handle` directly to ensure that we're getting the entity
      // from the `entityDb` itself, and not relying on the `DecodedHandle`
      // fallback behavior.
      const entityInDb = entityDb.get(v.Handle.dangerouslyCreateFromTypeAndId(Entity, 'test'));
      const entityInDecodedHandle = data.resolve(v.DecodedEntityDB.emptyDb);
      expect(entityInDecodedHandle).to.equal(entityInDb);
    });
  });

  describe('view-model tests', () => {
    it('supports nested handle associations', () => {
      const NestedChild = v.entityConstructor({
        typeName: 'NestedChild',
        version: 1,
        fields: {
          id: v.opt(v.string),
          nestedChildField: v.string,
        },
      });

      const Child = v.entityConstructor({
        typeName: 'Child',
        version: 1,
        fields: {
          id: v.opt(v.string),
          nestedChildren: v.associationList(v.handle(NestedChild)),
        },
      });

      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          id: v.opt(v.string),
          children: v.associationList(v.handle(Child)),
        },
      });

      const data = {
        id: 'parent1',
        _type: 'Parent',
        _version: 1,
        children: [{
          id: 'child1',
          _type: 'Child',
          _version: 1,
          nested_children: [{
            id: 'nestedChild1',
            _type: 'NestedChild',
            _version: 1,
            nested_child_field: 'nestedChildField1',
          }],
        }, {
          id: 'child2',
          _type: 'Child',
          _version: 1,
          nested_children: [],
        }],
      };
      const response = { data };

      const expectedEntityDb = (
        v.EntityDB.emptyDb
        .setEntity(new Parent({
          id: 'parent1',
          children: List([
            v.Handle.dangerouslyCreateFromTypeAndId(Child, 'child1'),
            v.Handle.dangerouslyCreateFromTypeAndId(Child, 'child2'),
          ]),
        }))
        .setEntity(new Child({
          id: 'child1',
          nestedChildren: List([
            v.Handle.dangerouslyCreateFromTypeAndId(NestedChild, 'nestedChild1'),
          ]),
        }))
        .setEntity(new Child({
          id: 'child2',
          nestedChildren: List([]),
        }))
        .setEntity(new NestedChild({
          id: 'nestedChild1',
          nestedChildField: 'nestedChildField1',
        }))
      );

      const { entityDb } = v.decodeResponse({
        response,
        codec: v.handle(Parent),
      });
      expect(entityDb.toJS()).to.deep.equal(expectedEntityDb.toJS());
    });

    it('supports handles to root entities', () => {
      const Child = v.entityConstructor({
        typeName: 'Child',
        version: 1,
        fields: {
          id: v.opt(v.string),
          childField: v.string,
        },
      });

      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          id: v.opt(v.string),
          child: v.refHandle(Child),
          children: v.associationList(v.refHandle(Child)),
        },
      });

      const data = {
        id: 'parent1',
        _type: 'Parent',
        _version: 1,
        child: {
          _ref: 'ref1',
        },
        children: [{ _ref: 'ref2' }, { _ref: 'ref3' }],
      };

      const references = {
        ref1: {
          id: 'child1',
          _type: 'Child',
          _version: 1,
          child_field: 'childField1',
        },
        ref2: {
          id: 'child2',
          _type: 'Child',
          _version: 1,
          child_field: 'childField2',
        },
        ref3: {
          id: 'child3',
          _type: 'Child',
          _version: 1,
          child_field: 'childField3',
        },
      };

      const child1 = Child.decodedEntity({
        id: 'child1',
        childField: 'childField1',
      });
      const child2 = Child.decodedEntity({
        id: 'child2',
        childField: 'childField2',
      });
      const child3 = Child.decodedEntity({
        id: 'child3',
        childField: 'childField3',
      });
      const child1Handle = new v.DecodedHandle(Child, child1);
      const child2Handle = new v.DecodedHandle(Child, child2);
      const child3Handle = new v.DecodedHandle(Child, child3);

      const expectedEntityDb = (
        v.EntityDB.emptyDb
        .setEntity(new Parent({
          id: 'parent1',
          child: child1Handle,
          children: List([
            child2Handle,
            child3Handle,
          ]),
        }))
        .setEntity(child1)
        .setEntity(child2)
        .setEntity(child3)
      );

      const { entityDb } = v.decodeResponse({
        response: { data, references },
        codec: v.handle(Parent),
      });
      expect(entityDb.toJS()).to.deep.equal(expectedEntityDb.toJS());
    });

    it('merges server updates ', () => {
      const Child = v.entityConstructor({
        typeName: 'Child',
        version: 1,
        fields: {
          id: v.opt(v.string),
          childField: v.string,
        },
      });

      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          id: v.opt(v.string),
          child1: v.nullable(v.handle(Child)),
          child2: v.nullable(v.handle(Child)),
        },
      });

      const data = {
        id: 'parent1',
        _type: 'Parent',
        _version: 1,
        child_1: {
          id: 'child1',
          _type: 'Child',
          _version: 1,
          child_field: 'newChildField1',
        },
        child_2: {
          id: 'child2',
          _type: 'Child',
          _version: 1,
          child_field: 'newChildField2',
        },
      };

      const localEntityDb = (
        v.EntityDB.emptyDb
        .setEntity(new Parent({
          id: 'parent1',
          child1: v.Handle.dangerouslyCreateFromTypeAndId(Child, 'child1'),
          child2: null,
        }))
        .setEntity(new Child({
          id: 'child1',
          childField: 'childField1',
        }))
        .setEntity(new Parent({
          id: 'parent2',
          child1: null,
          child2: null,
        }))
      );

      const expectedEntityDb = (
        v.EntityDB.emptyDb
        .setEntity(new Parent({
          id: 'parent1',
          child1: v.Handle.dangerouslyCreateFromTypeAndId(Child, 'child1'),
          child2: v.Handle.dangerouslyCreateFromTypeAndId(Child, 'child2'),
        }))
        .setEntity(new Child({
          id: 'child1',
          childField: 'newChildField1',
        }))
        .setEntity(new Child({
          id: 'child2',
          childField: 'newChildField2',
        }))
        .setEntity(new Parent({
          id: 'parent2',
          child1: null,
          child2: null,
        }))
      );

      const { entityDb } = v.decodeResponse({
        response: { data },
        codec: v.handle(Parent),
      });

      expect(localEntityDb.merge(
        v.EntityDB.from(entityDb),
      ).toJS()).to.deep.equal(expectedEntityDb.toJS());
    });

    it('supports subtyping via unioned associations', () => {
      const Child = v.entityConstructor({
        typeName: 'Child',
        version: 1,
        fields: {
          id: v.opt(v.string),
          childField: v.string,
        },
      });

      const ChildA = v.entityConstructor({
        typeName: 'ChildA',
        version: 1,
        fields: {
          ...Child.fields,
          childAField: v.string,
        },
      });

      const ChildB = v.entityConstructor({
        typeName: 'ChildB',
        version: 1,
        fields: {
          ...Child.fields,
          childBField: v.string,
        },
      });

      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          id: v.opt(v.string),
          children: v.associationList(
            v.union([v.handle(ChildA), v.handle(ChildB)]),
          ),
        },
      });

      const data = {
        id: 'parent1',
        _type: 'Parent',
        _version: 1,
        children: [{
          id: 'child1',
          _type: 'ChildA',
          _version: 1,
          child_field: 'childField1',
          child_a_field: 'childAField1',
        }, {
          id: 'child2',
          _type: 'ChildB',
          _version: 1,
          child_field: 'childField2',
          child_b_field: 'childBField2',
        }],
      };

      const expectedEntityDb = (
        v.EntityDB.emptyDb
        .setEntity(new Parent({
          id: 'parent1',
          children: List([
            v.Handle.dangerouslyCreateFromTypeAndId(ChildA, 'child1'),
            v.Handle.dangerouslyCreateFromTypeAndId(ChildB, 'child2'),
          ]),
        }))
        .setEntity(new ChildA({
          id: 'child1',
          childField: 'childField1',
          childAField: 'childAField1',
        }))
        .setEntity(new ChildB({
          id: 'child2',
          childField: 'childField2',
          childBField: 'childBField2',
        }))
      );

      const { entityDb } = v.decodeResponse({
        response: { data },
        codec: v.handle(Parent),
      });
      expect(entityDb.toJS()).to.deep.equal(expectedEntityDb.toJS());
    });

    it('handles array payloads', () => {
      const Entity = v.entityConstructor({
        typeName: 'Entity',
        version: 1,
        fields: {
          id: v.opt(v.string),
        },
      });

      const data = [{
        id: 'entity1',
        _type: 'Entity',
        _version: 1,
      }, {
        id: 'entity2',
        _type: 'Entity',
        _version: 1,
      }];

      const expectedEntityDb = (
        v.EntityDB.emptyDb
        .setEntity(new Entity({ id: 'entity1' }))
        .setEntity(new Entity({ id: 'entity2' }))
      );

      expect(
        v.decodeResponse({
          response: { data },
          codec: v.list(v.handle(Entity)),
        }).entityDb.toJS(),
      ).to.deep.equal(expectedEntityDb.toJS());
      expect(
        v.decodeResponse({
          response: { data },
          codec: v.list(v.handle(Entity)),
        }).entityDb.toJS(),
      ).to.deep.equal(expectedEntityDb.toJS());
      expect(
        v.decodeResponse({
          response: { data },
          codec: v.array(v.handle(Entity)),
        }).entityDb.toJS(),
      ).to.deep.equal(expectedEntityDb.toJS());
    });

    describe('types', () => {
      it('supports custom codecs', () => {
        const Entity = v.entityConstructor({
          typeName: 'Entity',
          version: 1,
          fields: {
            date: DateCodec,
          },
        });

        const data = {
          _type: 'Entity',
          _version: 1,
          date: '1941-09-09T13:37:00.000Z',
        };

        const expectedEntity = new Entity({
          date: new Date('1941-09-09T13:37:00.000Z'),
        });

        expect(
          v.decodeResponse({
            response: { data },
            codec: v.nested(Entity),
          }).data.toJS(),
        ).to.deep.equal(expectedEntity.toJS());
      });

      it('allows null when using nullable() codec', () => {
        const Child = v.entityConstructor({
          typeName: 'Child',
          version: 1,
          fields: {
            id: v.opt(v.string),
          },
        });

        const Entity = v.entityConstructor({
          typeName: 'Entity',
          version: 1,
          fields: {
            id: v.opt(v.string),
            field1: v.nullable(v.string),
            field2: v.nullable(DateCodec),
            field3: v.nullable(v.handle(Child)),
            field4: v.nullable(v.associationList(v.handle(Child))),
          },
        });

        const data = {
          _type: 'Entity',
          _version: 1,
          id: 'entity1',
          field_1: null,
          field_2: null,
          field_3: null,
          field_4: null,
        };

        const expectedEntityDb = (
          v.EntityDB.emptyDb
          .setEntity(new Entity({
            id: 'entity1',
            field1: null,
            field2: null,
            field3: null,
            field4: null,
          }))
        );

        expect(
          v.decodeResponse({
            response: { data },
            codec: v.handle(Entity),
          }).entityDb.toJS(),
        ).to.deep.equal(expectedEntityDb.toJS());
      });

      it('supports primitive types', () => {
        const Entity = v.entityConstructor({
          typeName: 'Entity',
          version: 1,
          fields: {
            field1: v.string,
            field2: v.number,
            field3: v.boolean,
          },
        });

        const data = {
          _type: 'Entity',
          _version: 1,
          field_1: '1',
          field_2: 2,
          field_3: true,
        };

        const expectedEntity = new Entity({
          field1: '1',
          field2: 2,
          field3: true,
        });

        expect(
          v.decodeResponse({
            response: { data },
            codec: v.nested(Entity),
          }).data.toJS(),
        ).to.deep.equal(expectedEntity.toJS());
      });

      it('supports readOnly types', () => {
        const Entity = v.entityConstructor({
          typeName: 'Entity',
          version: 1,
          fields: {
            field1: v.readOnly(v.string),
          },
        });

        const data = {
          _type: 'Entity',
          _version: 1,
          field_1: '1',
        };

        const expectedEntity = Entity.decodedEntity({
          field1: '1',
        });

        expect(
          v.decodeResponse({
            response: { data },
            codec: v.nested(Entity),
          }).data.toJS(),
        ).to.deep.equal(expectedEntity.toJS());
      });

      it('treats writeOnly fields as undefined', () => {
        const Entity = v.entityConstructor({
          typeName: 'Entity',
          version: 1,
          fields: {
            field1: v.writeOnly(v.string),
          },
        });

        const data = {
          _type: 'Entity',
          _version: 1,
        };

        const expectedEntity = new Entity({
          field1: undefined,
        });

        expect(
          v.decodeResponse({
            response: { data },
            codec: v.nested(Entity),
          }).data.toJS(),
        ).to.deep.equal(expectedEntity.toJS());
      });
    });

    describe('external associations', () => {
      const Target = v.entityConstructor({
        typeName: 'Target',
        version: 2,
        fields: {
          id: v.opt(v.string),
        },
      });

      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          id: v.opt(v.string),
          target: v.handle(Target),
        },
      });

      const ExternalAssociation = v.entityConstructor({
        typeName: 'ExternalAssociation',
        version: undefined,
        fields: {
          id: v.opt(v.string),
          parents: v.associationList(v.handle(Parent)),
        },
      });

      it('adds the list in addition to what update provides', () => {
        const response = {
          data: [{
            id: 'parent1',
            _type: 'Parent',
            _version: 1,
            target: { id: 'target1', _type: 'Target', _version: 2 },
          }, {
            id: 'parent2',
            _type: 'Parent',
            _version: 1,
            target: { id: 'target2', _type: 'Target', _version: 2 },
          }],
        };

        const expectedEntityDb = (
          v.EntityDB.emptyDb
          .setEntity(new Parent({
            id: 'parent1',
            target: v.Handle.dangerouslyCreateFromTypeAndId(Target, 'target1'),
          }))
          .setEntity(new Parent({
            id: 'parent2',
            target: v.Handle.dangerouslyCreateFromTypeAndId(Target, 'target2'),
          }))
          .setEntity(new Target({ id: 'target1' }))
          .setEntity(new Target({ id: 'target2' }))
          .setEntity(new ExternalAssociation({
            id: 'test',
            parents: List([
              v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'parent1'),
              v.Handle.dangerouslyCreateFromTypeAndId(Parent, 'parent2'),
            ]),
          }))
        );

        const { entityDb, data } = v.decodeResponse({
          response,
          codec: ExternalAssociation.fields.parents,
        });
        const finalEntityDb = entityDb.setEntity(ExternalAssociation.decodedEntity({
          id: 'test',
          parents: data,
        }));
        expect(finalEntityDb.toJS()).to.deep.equal(expectedEntityDb.toJS());
      });

      it('throws when provided with a non-top-level list', () => {
        expect(() => (
          v.decodeResponse({
            response: {
              data: {
                id: 'parent1',
                _type: 'Parent',
                _version: 1,
                target: { id: 'target1', _type: 'Target', _version: 2 },
              },
            },
            codec: ExternalAssociation.fields.parents,
          })
        )).to.throw(v.DecodeError);
      });
    });

    describe('validations', () => {
      it("throws when versions don't match", () => {
        const Entity = v.entityConstructor({
          typeName: 'Entity',
          version: 2,
          fields: {},
        });

        const data = {
          _type: 'Entity',
          _version: 1,
        };

        expect(() => (
          v.decodeResponse({
            response: { data },
            codec: v.nested(Entity),
          })
        )).to.throw(v.DecodeError);
      });

      it('throws when null is returned for notNull type', () => {
        const Child = v.entityConstructor({
          typeName: 'Child',
          version: 1,
          fields: {
            id: v.opt(v.string),
          },
        });

        const Parent = v.entityConstructor({
          typeName: 'Parent',
          version: 1,
          fields: {
            id: v.opt(v.string),
            field1: v.string,
            field2: v.list(v.string),
            field3: v.nested(Child),
          },
        });

        const data = {
          _type: 'Parent',
          _version: 1,
          id: 'parent1',
          field_1: '',
          field_2: [''],
          field_3: {
            id: 'child1',
            _type: 'Child',
            _version: 1,
          },
        };

        [
          { data: { ...data, field_1: null } },
          { data: { ...data, field_2: null } },
          { data: { ...data, field_3: null } },
        ].forEach((response) => {
          expect(() => (
            v.decodeResponse({
              response,
              codec: v.nested(Parent),
            })
          )).to.throw(v.DecodeError);
        });
      });

      it('throws error when type does not match expected type', () => {
        const Entity = v.entityConstructor({
          typeName: 'Entity',
          version: 1,
          fields: {
            field1: v.string,
            field2: v.number,
            field3: v.boolean,
            field4: DateCodec,
          },
        });

        const data = {
          _type: 'Entity',
          _version: 1,
          field_1: 'string',
          field_2: 2,
          field_3: false,
          field_4: '1941-09-09T13:37:00.000Z',
        };

        [
          { ...data, field_1: true },
          { ...data, field_2: true },
          { ...data, field_3: 2 },
          { ...data, field_4: true },
        ].forEach((d) => {
          expect(() => (
            v.decodeResponse({
              response: { data: d },
              codec: v.nested(Entity),
            })
          )).to.throw(v.DecodeError);
        });
      });

      it('does not throw when receiving unknown fields', () => {
        const Entity = v.entityConstructor({
          typeName: 'Entity',
          version: 1,
          fields: {},
        });

        const data = {
          _type: 'Entity',
          _version: 1,
          unexpected: true,
        };

        expect(
          v.decodeResponse({
            response: { data },
            codec: v.nested(Entity),
          }).data,
        ).to.not.have.property('unexpected');
      });

      it('throws when a field is missing', () => {
        const Entity = v.entityConstructor({
          typeName: 'Entity',
          version: 1,
          fields: {
            field1: v.string,
          },
        });

        const data = {
          _type: 'Entity',
          _version: 1,
        };

        expect(() => (
          v.decodeResponse({
            response: { data },
            codec: v.nested(Entity),
          })
        )).to.throw(v.DecodeError);
      });

      it('throws when a writeOnly field is present', () => {
        const Entity = v.entityConstructor({
          typeName: 'Entity',
          version: 1,
          fields: {
            field1: v.writeOnly(v.string),
          },
        });

        const data = {
          _type: 'Entity',
          _version: 1,
          field_1: 'field1',
        };

        expect(() => (
          v.decodeResponse({
            response: { data },
            codec: v.nested(Entity),
          })
        )).to.throw(v.DecodeError);
      });

      it('does not throw when a writeOnly field is missing', () => {
        const Entity = v.entityConstructor({
          typeName: 'Entity',
          version: 1,
          fields: {
            field1: v.writeOnly(v.string),
          },
        });

        const data = {
          _type: 'Entity',
          _version: 1,
        };

        expect(
          v.decodeResponse({
            response: { data },
            codec: v.nested(Entity),
          }).data,
        ).to.have.property('field1', undefined);
      });
    });

    describe('nested entities', () => {
      const Target = v.entityConstructor({
        typeName: 'Target',
        version: 2,
        fields: {
          id: v.opt(v.string),
        },
      });

      const Child = v.entityConstructor({
        typeName: 'Child',
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
          text: v.nullable(v.string),
        },
      });

      const Parent = v.entityConstructor({
        typeName: 'Parent',
        version: 1,
        fields: {
          id: v.opt(v.string),
          children: v.associationList(v.nested(Child)),
          target: v.nullable(v.nested(Target)),
          sharedText: v.nullable(v.encodedRef(v.nested(SharedText))),
        },
      });

      it('works with non persisted entities', () => {
        const NonPersistedEntity = v.entityConstructor({
          typeName: 'NonPersistedEntity',
          version: 1,
          fields: {
            fieldA: v.nullable(v.string),
          },
        });

        const data = {
          _type:    'NonPersistedEntity',
          _version: 1,
          field_a:  'text',
        };

        const expected = new NonPersistedEntity({ fieldA: 'text' });

        expect(
          v.decodeResponse({
            response: { data },
            codec: v.nested(NonPersistedEntity),
          }).data.toJS(),
        ).to.deep.equal(expected.toJS());
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

        const expected = new Parent({
          id:       'parent1',
          target:   new Target({
            id:       'target1',
          }),
          children: List([
            new Child({ id: 'child1' }),
            new Child({ id: 'child2' }),
          ]),
          sharedText: null,
        });

        expect(
          v.decodeResponse({
            response: { data },
            codec: v.nested(Parent),
          }).data.toJS(),
        ).to.deep.equal(expected.toJS());
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

        let refAccessCount = 0;
        const references = {
          get stref001() {
            refAccessCount += 1;

            return {
              _type:    'SharedText',
              _version: 1,
              id:       'sharedtext1',
              text: 'Shared Text 1',
            };
          },
        };

        const result = v.decodeResponse({
          response: { data, references },
          codec: v.list(v.nested(Parent)),
        });

        const expected = List([
          new Parent({
            id:         'parent1',
            children:   List(),
            target:     null,
            sharedText: new SharedText({
              id:       'sharedtext1',
              text:     'Shared Text 1',
            }),
          }),
          new Parent({
            id:         'parent2',
            children:   List(),
            target:     null,
            sharedText: new SharedText({
              id:       'sharedtext1',
              text:     'Shared Text 1',
            }),
          }),
        ]);

        expect(result.data.toJS()).to.deep.equal(expected.toJS());

        // Note: references are accessed twice, once for initial check to make
        // sure references conform to `Record<string, unknown>`, and later when
        // actually decoding.
        expect(refAccessCount).to.equal(2);
      });

      it('creates handles which can be resolved directly or indirectly', () => {
        const Bottom = v.entityConstructor({
          typeName: 'Bottom',
          version:  1,
          fields: {
            id: v.opt(v.string),
            flag: v.boolean,
          },
        });
        const Middle = v.entityConstructor({
          typeName: 'Middle',
          version: 1,
          fields: {
            id: v.opt(v.string),
            bottom: v.list(v.handle(Bottom)),
          },
        });
        const Top = v.entityConstructor({
          typeName: 'Top',
          version: 1,
          fields: {
            id: v.opt(v.string),
            middle: v.nullable(v.refHandle(Middle)),
          },
        });
        const data = [
          {
            _type:       'Top',
            _version:    1,
            id:          'top1',
            middle:      { _ref: 'ref1' },
          },
          {
            _type:       'Top',
            _version:    1,
            id:          'top2',
            middle:      null,
          },
        ];

        const references = {
          ref1: {
            _type:    'Middle',
            _version: 1,
            id: 'middle1',
            bottom: [{
              _type: 'Bottom',
              _version: 1,
              id: 'bot1',
              flag: true,
            }, {
              _type: 'Bottom',
              _version: 1,
              id: 'bot2',
              flag: false,
            }],
          },
        };

        const { data: result, entityDb } = v.decodeResponse({
          response: { data, references },
          codec: v.list(v.nested(Top)),
        });

        // The old way to write out nested selectors
        const indirectResults = result.map(
          (d) => {
            if (d.middle === null) {
              return undefined;
            }
            const middle = entityDb.get(d.middle);
            return middle.bottom.map((b) => entityDb.get(b).flag);
          },
        );

        // The new way with `resolve`.
        const directResults: typeof indirectResults = result.map(
          (d) => d.middle?.resolve(entityDb).bottom.map((b) => b.resolve(entityDb).flag),
        );

        expect(indirectResults).to.deep.equal(directResults);
      });

      it('applies type based deserialization', () => {
        const DateThing = v.entityConstructor({
          typeName: 'DateThing',
          version: 1,
          fields: {
            id: v.opt(v.string),
            timestamp: DateCodec,
            timestamps: v.list(DateCodec),
          },
        });

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

        const result = v.decodeResponse({
          response: { data },
          codec: v.nested(DateThing),
        });

        const { timestamp, timestamps } = result.data;

        expect(timestamp).to.deep.equal(new Date(-893413380000));
        expect(timestamps.toJS()).to.deep.equal(List([
          new Date(-2104654980000),
          new Date(-1812709380000),
        ]).toJS());
      });

      describe('validation', () => {
        const Validation = v.entityConstructor({
          typeName: 'Validation',
          version: 1,
          fields: {
            id: v.opt(v.string),
            k1: v.string,
            k2: v.list(v.string),
            k3: v.nested(Child),
            k4: v.associationList(v.nested(Child)),
          },
        });

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
          expect(() => v.decodeResponse({
            response: { data: { ...data, _version: 2 } },
            codec: v.nested(Validation),
          })).to.throw(v.DecodeError);
        });

        it('throws when association type is incorrect', () => {
          [
            { data: { ...data, k_3: { _type: 'Target', _version: 2, id: 't1' } } },
            { data: { ...data, k_4: [{ _type: 'Target', _version: 2, id: 't1' }] } },
          ].forEach((response) => {
            expect(() => v.decodeResponse({
              response,
              codec: v.nested(Validation),
            })).to.throw(v.DecodeError);
          });
        });

        it('throws error when null is returned for notNull type', () => {
          [
            { data: { ...data, k_1: null } },
            { data: { ...data, k_2: null } },
            { data: { ...data, k_3: null } },
            { data: { ...data, k_4: null } },
          ].forEach((response) => {
            expect(() => v.decodeResponse({
              response,
              codec: v.nested(Validation),
            })).to.throw(v.DecodeError);
          });
        });

        it('throws when type unexpectedly returns a collection', () => {
          [
            { data: { ...data, k_1: [] } },
            { data: { ...data, k_3: [] } },
          ].forEach((response) => {
            expect(() => v.decodeResponse({
              response,
              codec: v.nested(Validation),
            })).to.throw(v.DecodeError);
          });
        });

        it('throws when type unexpectedly is not a collection', () => {
          [
            { data: { ...data, k_2: '' } },
            { data: { ...data, k_4: '' } },
          ].forEach((response) => {
            expect(() => v.decodeResponse({
              response,
              codec: v.nested(Validation),
            })).to.throw(v.DecodeError);
          });
        });

        it('throws when shared associations are nested in the data tree (no references)', () => {
          expect(() => v.decodeResponse({
            response: {
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
            },
            codec: v.nested(Validation),
          })).to.throw(v.DecodeError);
        });
      });
    });
  });
});
