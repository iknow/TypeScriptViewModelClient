import { expect } from 'chai';
import { fromJS, List, Map } from 'immutable';
import { createSandbox } from 'sinon';
import ViewModelClient from '../';
import { TypeRegistryError } from '../utils/TypeRegistry';
import ViewModelClientError from '../utils/ViewModelClientError';
import {
  AssignmentError,
  FieldMissingError,
  NormalizeNonPersistedError,
  NotNullError,
  UnexpectedFieldError,
  UnexpectedWriteOnlyFieldError,
} from './validate';

const emptyState = new Map();

describe('remote/download', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('update', () => {
    describe('normalization', () => {
      it('handles nested associations', () => {
        const vmClient = new ViewModelClient();

        const NestedChild = vmClient.defineClass({
          typeName: 'NestedChild',
          version: 1,
          persisted: true,
          attributes: {
            nestedChildField: 'string',
          },
        });

        const Child = vmClient.defineClass({
          typeName: 'Child',
          version: 1,
          persisted: true,
          associations: {
            nestedChildren: [NestedChild],
          },
        });

        const Parent = vmClient.defineClass({
          typeName: 'Parent',
          version: 1,
          persisted: true,
          associations: {
            children: [Child],
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

        const normalizedEntityStore = fromJS({
          Parent: {
            parent1: new Parent({
              id: 'parent1',
              children: List(['child1', 'child2']),
            }),
          },
          Child: {
            child1: new Child({
              id: 'child1',
              nestedChildren: List(['nestedChild1']),
            }),
            child2: new Child({
              id: 'child2',
              nestedChildren: List(),
            }),
          },
          NestedChild: {
            nestedChild1: new NestedChild({
              id: 'nestedChild1',
              nestedChildField: 'nestedChildField1',
            }),
          },
        });

        const result = vmClient.update(emptyState, { data });
        expect(result).to.eql(normalizedEntityStore);
      });

      it('handles shared associations', () => {
        const vmClient = new ViewModelClient();

        const Child = vmClient.defineClass({
          shared: true,
          typeName: 'Child',
          version: 1,
          persisted: true,
          attributes: {
            childField: 'string',
          },
        });

        const Parent = vmClient.defineClass({
          typeName: 'Parent',
          version: 1,
          persisted: true,
          associations: {
            child: {
              type: Child,
              shared: true,
            },
            children: {
              type: Child,
              collection: true,
              shared: true,
            },
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

        const normalizedEntityStore = fromJS({
          Parent: {
            parent1: new Parent({
              id: 'parent1',
              child: 'child1',
              children: List(['child2', 'child3']),
            }),
          },
          Child: {
            child1: new Child({
              id: 'child1',
              childField: 'childField1',
            }),
            child2: new Child({
              id: 'child2',
              childField: 'childField2',
            }),
            child3: new Child({
              id: 'child3',
              childField: 'childField3',
            }),
          },
        });

        const result = vmClient.update(emptyState, { data, references });
        expect(result).to.eql(normalizedEntityStore);
      });

      it('merges server updates ', () => {
        const vmClient = new ViewModelClient();

        const Child = vmClient.defineClass({
          typeName: 'Child',
          version: 1,
          persisted: true,
          attributes: {
            childField: 'string',
          },
        });

        const Parent = vmClient.defineClass({
          typeName: 'Parent',
          version: 1,
          persisted: true,
          associations: {
            child1: Child,
            child2: Child,
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

        const existingState = fromJS({
          Parent: {
            parent1: new Parent({
              id: 'parent1',
              _type: 'Parent',
              _version: 1,
              child1: 'child1',
              child2: null,
            }),
          },
          Child: {
            child1: new Child({
              id: 'child1',
              _type: 'Child',
              _version: 1,
              childField: 'childField1',
            }),
          },
        });

        const updatedState = fromJS({
          Parent: {
            parent1: new Parent({
              id: 'parent1',
              _type: 'Parent',
              _version: 1,
              child1: 'child1',
              child2: 'child2',
            }),
          },
          Child: {
            child1: new Child({
              id: 'child1',
              _type: 'Child',
              _version: 1,
              childField: 'newChildField1',
            }),
            child2: new Child({
              id: 'child2',
              _type: 'Child',
              _version: 1,
              childField: 'newChildField2',
            }),
          },
        });

        const result = vmClient.update(existingState, { data });
        expect(result).to.eql(updatedState);
      });

      it('handles subtyping', () => {
        const vmClient = new ViewModelClient();

        const Child = vmClient.defineClass({
          typeName: 'Child',
          version: 1,
          persisted: true,
          attributes: {
            childField: 'string',
          },
        });

        const ChildA = vmClient.defineClass({
          typeName: 'ChildA',
          version: 1,
          persisted: true,
          extends: Child,
          attributes: {
            childAField: 'string',
          },
        });

        const ChildB = vmClient.defineClass({
          typeName: 'ChildB',
          version: 1,
          persisted: true,
          extends: Child,
          attributes: {
            childBField: 'string',
          },
        });

        const Parent = vmClient.defineClass({
          typeName: 'Parent',
          version: 1,
          persisted: true,
          associations: {
            children: [Child],
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

        const normalisedEntities = fromJS({
          Parent: {
            parent1: new Parent({
              id: 'parent1',
              _type: 'Parent',
              _version: 1,
              children: List(['child1', 'child2']),
            }),
          },
          Child: {
            child1: new ChildA({
              id: 'child1',
              childField: 'childField1',
              childAField: 'childAField1',
            }),
            child2: new ChildB({
              id: 'child2',
              childField: 'childField2',
              childBField: 'childBField2',
            }),
          },
        });

        const result = vmClient.update(emptyState, { data });
        expect(result).to.eql(normalisedEntities);
      });

      it('handles maybe shared subtypes', () => {
        const vmClient = new ViewModelClient();

        const Child = vmClient.defineClass({
          typeName: 'Child',
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
          extends: Child,
          attributes: {
            sharedChildField: 'string',
          },
        });

        const OwnedChild = vmClient.defineClass({
          typeName: 'OwnedChild',
          version: 1,
          persisted: true,
          extends: Child,
          attributes: {
            ownedChildField: 'string',
          },
        });

        const Parent = vmClient.defineClass({
          typeName: 'Parent',
          version: 1,
          persisted: true,
          associations: {
            children: {
              collection: true,
              type: Child,
              shared: 'maybe',
            },
          },
        });

        const data = {
          id: 'parent1',
          _type: 'Parent',
          _version: 1,
          children: [{
            _ref: 'ref1',
          }, {
            id: 'child2',
            _type: 'OwnedChild',
            _version: 1,
            child_field: 'owned',
            owned_child_field: 'owned',
          }],
        };

        const references = {
          ref1: {
            id: 'child1',
            _type: 'SharedChild',
            _version: 1,
            child_field: 'shared',
            shared_child_field: 'shared',
          },
        };

        const normalisedEntities = fromJS({
          Parent: {
            parent1: new Parent({
              id: 'parent1',
              _type: 'Parent',
              _version: 1,
              children: List(['child1', 'child2']),
            }),
          },
          Child: {
            child1: new SharedChild({
              id: 'child1',
              childField: 'shared',
              sharedChildField: 'shared',
            }),
            child2: new OwnedChild({
              id: 'child2',
              childField: 'owned',
              ownedChildField: 'owned',
            }),
          },
        });

        const result = vmClient.update(emptyState, { data, references });
        expect(result).to.eql(normalisedEntities);
      });

      it('handles array payloads', () => {
        const vmClient = new ViewModelClient();

        const Entity = vmClient.defineClass({
          typeName: 'Entity',
          version: 1,
          persisted: true,
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

        const normalisedEntities = fromJS({
          Entity: {
            entity1: new Entity({ id: 'entity1' }),
            entity2: new Entity({ id: 'entity2' }),
          },
        });

        const result = vmClient.update(emptyState, { data });
        expect(result).to.eql(normalisedEntities);
      });
    });

    describe('types', () => {
      it('handles marshallers', () => {
        const vmClient = new ViewModelClient();

        const Entity = vmClient.defineClass({
          typeName: 'Entity',
          version: 1,
          persisted: true,
          attributes: {
            date: {
              type: Date,
              marshaller: {
                deserialize: (d) => new Date(d),
                serialize: (d) => d.toString(),
              },
            },
          },
        });

        const data = {
          _type: 'Entity',
          _version: 1,
          id: 'entity1',
          date: '1941-09-09T13:37:00.000Z',
        };

        const normalisedEntities = fromJS({
          Entity: {
            entity1: new Entity({
              id: 'entity1',
              date: new Date('1941-09-09T13:37:00.000Z'),
            }),
          },
        });

        const result = vmClient.update(emptyState, { data });
        expect(result).to.eql(normalisedEntities);
      });

      it('deserializes null types as null', () => {
        const vmClient = new ViewModelClient();

        const Child = vmClient.defineClass({
          typeName: 'Child',
          version: 1,
          persisted: true,
        });

        const Entity = vmClient.defineClass({
          typeName: 'Entity',
          version: 1,
          persisted: true,
          attributes: {
            field1: 'string',
            field2: {
              type: Date,
              marshaller: {
                deserialize: (d) => new Date(d),
                serialize: (d) => d.toString(),
              },
            },
          },
          associations: {
            field3: Child,
            field4: [Child],
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

        const normalisedEntities = fromJS({
          Entity: {
            entity1: new Entity({
              id: 'entity1',
              field1: null,
              field2: null,
              field3: null,
              field4: null,
            }),
          },
        });

        const result = vmClient.update(emptyState, { data });
        expect(result).to.eql(normalisedEntities);
      });

      it('handles primitive types', () => {
        const vmClient = new ViewModelClient();

        const Entity = vmClient.defineClass({
          typeName: 'Entity',
          version: 1,
          persisted: true,
          attributes: {
            field1: 'string',
            field2: 'number',
            field3: 'boolean',
          },
        });

        const data = {
          _type: 'Entity',
          _version: 1,
          id: 'entity1',
          field_1: '1',
          field_2: 2,
          field_3: true,
        };

        const normalisedEntities = fromJS({
          Entity: {
            entity1: new Entity({
              id: 'entity1',
              field1: '1',
              field2: 2,
              field3: true,
            }),
          },
        });

        const result = vmClient.update(emptyState, { data });
        expect(result).to.eql(normalisedEntities);
      });

      it('treats writeOnly fields as undefined', () => {
        const vmClient = new ViewModelClient();

        const Entity = vmClient.defineClass({
          typeName: 'Entity',
          version: 1,
          persisted: true,
          attributes: {
            field1: {
              type: 'string',
              writeOnly: true,
            },
          },
        });

        const data = {
          _type: 'Entity',
          _version: 1,
          id: 'entity1',
        };

        const normalisedEntities = fromJS({
          Entity: {
            entity1: new Entity({
              id: 'entity1',
              field1: undefined,
            }),
          },
        });

        const result = vmClient.update(emptyState, { data });
        expect(result).to.eql(normalisedEntities);
      });
    });
  });

  describe('updateExternalAssociation', () => {
    const vmClient = new ViewModelClient();

    const Target = vmClient.defineClass({
      typeName: 'Target',
      version: 2,
      persisted: true,
    });

    const Parent = vmClient.defineClass({
      typeName: 'Parent',
      version: 1,
      persisted: true,
      associations: {
        target: Target,
      },
    });

    const ExternalAssociation = vmClient.defineExternalAssociation({
      typeName: 'ExternalAssociation',
      associationType: Parent,
    });

    it('adds the list in addition to what update provides', () => {
      const data = [{
        id: 'parent1',
        _type: 'Parent',
        _version: 1,
        target: { id: 'target1', _type: 'Target', _version: 2 },
      }, {
        id: 'parent2',
        _type: 'Parent',
        _version: 1,
        target: { id: 'target2', _type: 'Target', _version: 2 },
      }];

      const normalizedEntityStore = fromJS({
        Parent: {
          parent1: new Parent({
            id: 'parent1',
            _type: 'Parent',
            _version: 1,
            target: 'target1',
          }),
          parent2: new Parent({
            id: 'parent2',
            _type: 'Parent',
            _version: 1,
            target: 'target2',
          }),
        },
        Target: {
          target1: new Target({ id: 'target1', _type: 'Target', _version: 2 }),
          target2: new Target({ id: 'target2', _type: 'Target', _version: 2 }),
        },
        ExternalAssociation: {
          test: ['parent1', 'parent2'],
        },
      });

      const result = vmClient.updateExternalAssociation(
        emptyState,
        { data },
        ExternalAssociation,
        'test',
      );
      expect(result).to.eql(normalizedEntityStore);
    });

    it('throws when serializing a non external association', () => {
      expect(
        () => vmClient.updateExternalAssociation(emptyState, {}, Parent, 'test'),
      ).to.throw(ViewModelClientError, /not an external association/);
    });

    it('throws when provided with a non-top-level list', () => {
      expect(
        () => vmClient.updateExternalAssociation(emptyState, {
          data: {
            id: 'parent1',
            _type: 'Parent',
            _version: 1,
            target: { id: 'target1', _type: 'Target', _version: 2 },
          },
        }, ExternalAssociation, 'test'),
      ).to.throw(ViewModelClientError, /only support lists/);
    });
  });

  describe('validations', () => {
    it("throws when versions don't match", () => {
      const vmClient = new ViewModelClient();

      vmClient.defineClass({
        typeName: 'Entity',
        version: 2,
        persisted: true,
      });

      const data = {
        _type: 'Entity',
        _version: 1,
        id: 'entity1',
      };

      expect(() => vmClient.update(emptyState, { data })).to.throw(TypeRegistryError);
    });

    it('throws error when null is returned for notNull type', () => {
      const vmClient = new ViewModelClient();

      const Child = vmClient.defineClass({
        typeName: 'Child',
        version: 1,
        persisted: true,
      });

      vmClient.defineClass({
        typeName: 'Parent',
        version: 1,
        persisted: true,
        attributes: {
          field1: {
            type: 'string',
            notNull: true,
          },
          field2: {
            type: 'string',
            collection: true,
            notNull: true,
          },
        },
        associations: {
          field3: {
            type: Child,
            notNull: true,
          },
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
        expect(() => vmClient.update(emptyState, response)).to.throw(NotNullError);
      });
    });

    it('throws error when type does not match deserialized format', () => {
      const vmClient = new ViewModelClient();

      vmClient.defineClass({
        typeName: 'Entity',
        version: 1,
        persisted: true,
        attributes: {
          field1: {
            type: 'string',
            marshallers: {
              deserializer: (n) => n,
              serializer: (s) => s,
            },
          },
        },
      });

      const data = {
        _type: 'Entity',
        _version: 1,
        id: 'entity1',
        field_1: 5,
      };

      expect(() => vmClient.update(emptyState, { data })).to.throw(AssignmentError);
    });

    it('throws error when type does not match primitive type expectation', () => {
      const vmClient = new ViewModelClient();

      vmClient.defineClass({
        typeName: 'Entity',
        version: 1,
        persisted: true,
        attributes: {
          field1: 'string',
          field2: 'number',
          field3: 'boolean',
        },
      });

      const data = {
        _type: 'Entity',
        _version: 1,
        id: 'entity1',
        field_1: 'string',
        field_2: 2,
        field_3: false,
      };

      [
        { ...data, field_1: true },
        { ...data, field_2: true },
        { ...data, field_3: 2 },
      ].forEach((d) => {
        expect(() => vmClient.update(emptyState, { data: d })).to.throw(AssignmentError);
      });
    });

    it('throws when receiving unexpected fields', () => {
      const vmClient = new ViewModelClient();

      vmClient.defineClass({
        typeName: 'Entity',
        version: 1,
        persisted: true,
      });

      const data = {
        _type: 'Entity',
        _version: 1,
        id: 'entity1',
        unexpected_field: true,
      };

      expect(() => vmClient.update(emptyState, { data })).to.throw(UnexpectedFieldError);
    });

    it('throws when a field is missing', () => {
      const vmClient = new ViewModelClient();

      vmClient.defineClass({
        typeName: 'Entity',
        version: 1,
        persisted: true,
        attributes: {
          field1: 'string',
        },
      });

      const data = {
        _type: 'Entity',
        _version: 1,
        id: 'entity1',
      };

      expect(() => vmClient.update(emptyState, { data })).to.throw(FieldMissingError);
    });

    it('throws when a writeOnly field is present', () => {
      const vmClient = new ViewModelClient();

      vmClient.defineClass({
        typeName: 'Entity',
        version: 1,
        persisted: true,
        attributes: {
          field1: {
            type: 'string',
            writeOnly: true,
          },
        },
      });

      const data = {
        _type: 'Entity',
        _version: 1,
        id: 'entity1',
        field_1: 'field1',
      };

      expect(() => vmClient.update(emptyState, { data })).to.throw(UnexpectedWriteOnlyFieldError);
    });

    it('does not throw when a writeOnly, notNull field is missing', () => {
      const vmClient = new ViewModelClient();

      vmClient.defineClass({
        typeName: 'Entity',
        version: 1,
        persisted: true,
        attributes: {
          field1: {
            type: 'string',
            writeOnly: true,
            notNull: true,
          },
        },
      });

      const data = {
        _type: 'Entity',
        _version: 1,
        id: 'entity1',
      };

      expect(() => vmClient.update(emptyState, { data })).to.not.throw();
    });

    it('throws when given a non persisted type', () => {
      const vmClient = new ViewModelClient();

      vmClient.defineClass({
        typeName: 'Entity',
        version: 1,
      });

      const data = {
        _type: 'Entity',
        _version: 1,
      };

      expect(() => vmClient.update(emptyState, { data })).to.throw(NormalizeNonPersistedError);
    });
  });
});
