import { List } from 'immutable';
import { expect } from 'chai';
import Fields from './utils/Fields';
import ViewModelClient, {
  Attribute,
  Association,
  ViewModelClientError,
  ENTITY,
  EXTERNAL_ASSOCIATION,
} from './index';
import { Role, RoleMarshaller } from './tests/shared';

describe('ViewModelClient', () => {
  describe('defineClass', () => {
    let vmClient;

    beforeEach(() => {
      vmClient = new ViewModelClient();
    });

    describe('allows subtyping', () => {
      let PolyChild;
      let ChildTypeA;
      let ChildTypeB;
      let CommonAssociation;

      beforeEach(() => {
        CommonAssociation = vmClient.defineClass({
          lockable: true,
          persisted: true,
          typeName: 'CommonAssociation',
          version: 1,
        });

        const RegularAssociation = vmClient.defineClass({
          persisted: true,
          typeName: 'RegularAssociation',
          version: 1,
        });

        PolyChild = vmClient.defineClass({
          typeName: 'PolyChild',
          version: 1,
          persisted: true,
          attributes: {
            commonAttr: 'string',
          },
          associations: {
            commonAssoc: CommonAssociation,
          },
        });

        ChildTypeA = vmClient.defineClass({
          typeName: 'ChildTypeA',
          version: 1,
          persisted: true,
          extends: PolyChild,
          attributes: {
            aAttr: 'string',
          },
          associations: {
            aAssoc: RegularAssociation,
          },
        });

        ChildTypeB = vmClient.defineClass({
          typeName: 'ChildTypeB',
          version: 1,
          persisted: true,
          extends: PolyChild,
          attributes: {
            bAttr: 'string',
          },
          associations: {
            bAssoc: RegularAssociation,
          },
        });
      });

      it('inherits the attributes from the parent', () => {
        expect(ChildTypeA.attributes).has.keys(Fields.ID, 'commonAttr', 'aAttr');
        expect(ChildTypeB.attributes).has.keys(Fields.ID, 'commonAttr', 'bAttr');
        expect(ChildTypeA.attributes.commonAttr).to.eql(PolyChild.attributes.commonAttr);
        expect(ChildTypeB.attributes.commonAttr).to.eql(PolyChild.attributes.commonAttr);
      });

      it('adds lock version attribute', () => {
        const Lockable = vmClient.defineClass({
          typeName: 'Lockable',
          version: 1,
          lockable: true,
        });

        expect(Lockable.attributes).has.key(Fields.LOCK_VERSION);
      });

      it('does not have lock version', () => {
        const NonLockable = vmClient.defineClass({
          typeName: 'NonLockable',
          version: 1,
          lockable: false,
        });

        expect(NonLockable.attributes).has.not.key(Fields.LOCK_VERSION);
      });

      it('adds id attribute', () => {
        const Persisted = vmClient.defineClass({
          typeName: 'Persisted',
          version: 1,
          persisted: true,
        });

        expect(Persisted.attributes).has.key(Fields.ID);
      });

      it('does not add id attribute', () => {
        const NonPersisted = vmClient.defineClass({
          typeName: 'NonPersisted',
          version: 1,
          persisted: false,
        });

        expect(NonPersisted.attributes).has.not.key(Fields.ID);
      });

      it('inherits the attributeNameMap from the parent', () => {
        expect(ChildTypeA.attributeNameMap).to.eql({
          id: 'id',
          common_attr: 'commonAttr',
          common_assoc: 'commonAssoc',
          a_attr: 'aAttr',
          a_assoc: 'aAssoc',
        });
        expect(ChildTypeB.attributeNameMap).to.eql({
          id: 'id',
          common_attr: 'commonAttr',
          common_assoc: 'commonAssoc',
          b_attr: 'bAttr',
          b_assoc: 'bAssoc',
        });
      });

      it('inherits the associations from the parent', () => {
        expect(ChildTypeA.associations).has.keys('commonAssoc', 'aAssoc');
        expect(ChildTypeB.associations).has.keys('commonAssoc', 'bAssoc');
        expect(ChildTypeA.associations.commonAssoc).to.eql(PolyChild.associations.commonAssoc);
        expect(ChildTypeB.associations.commonAssoc).to.eql(PolyChild.associations.commonAssoc);
      });

      it('inherits the store prefix', () => {
        expect(ChildTypeA.storePrefix).to.equal(PolyChild.storePrefix);
        expect(ChildTypeB.storePrefix).to.equal(PolyChild.storePrefix);
      });

      it('contains static reference to the parent constructor', () => {
        expect(ChildTypeA.extends).to.equal(PolyChild);
        expect(ChildTypeB.extends).to.equal(PolyChild);
      });

      it('registers the subtypes with the parent', () => {
        expect(PolyChild.subtypes).to.eql({ ChildTypeA, ChildTypeB });
      });
    });

    describe('returns a record constructor', () => {
      let EntityAssociation;
      let Entity;

      beforeEach(() => {
        EntityAssociation = vmClient.defineClass({
          typeName: 'Association',
          version: 1,
          persisted: true,
          attributes: {
            aAttr: 'string',
          },
        });

        Entity = vmClient.defineClass({
          typeName: 'Entity',
          version: 1,
          persisted: true,
          attributes: {
            shorthandAttr: 'string',
            shorthandCollectionAttr: ['string'],
            expandedAttr: {
              type: Role,
              collection: true,
              marshaller: RoleMarshaller,
              notNull: true,
              from: 'expanded_attr',
            },
          },
          associations: {
            shorthandAssoc: EntityAssociation,
            shorthandCollectionAssoc: [EntityAssociation],
            expandedAssoc: {
              type: EntityAssociation,
              collection: true,
              notNull: true,
              from: 'expanded_assoc',
              shared: true,
            },
          },
        });
      });

      it('has the kind of ENTITY', () => {
        expect(Entity.kind).to.equal(ENTITY);
      });

      it('expands shorthand attribute', () => {
        expect(Entity.attributes.shorthandAttr).to.eql(Attribute({
          type: 'string',
          collection: false,
          marshaller: undefined,
          notNull: false,
          from: 'shorthand_attr',
        }));
      });

      it('expands shorthand collection attribute', () => {
        expect(Entity.attributes.shorthandCollectionAttr).to.eql(Attribute({
          type: 'string',
          collection: true,
          marshaller: undefined,
          notNull: false,
          from: 'shorthand_collection_attr',
        }));
      });

      it('does not alter attributes for expanded attribute', () => {
        expect(Entity.attributes.expandedAttr).to.eql(Attribute({
          type: Role,
          collection: true,
          marshaller: RoleMarshaller,
          notNull: true,
          from: 'expanded_attr',
        }));
      });

      it('expands shorthand association', () => {
        expect(Entity.associations.shorthandAssoc).to.eql(Association({
          type: EntityAssociation,
          collection: false,
          notNull: false,
          from: 'shorthand_assoc',
          shared: false,
        }));
      });

      it('expands shorthand collection association', () => {
        expect(Entity.associations.shorthandCollectionAssoc).to.eql(Association({
          type: EntityAssociation,
          collection: true,
          notNull: false,
          from: 'shorthand_collection_assoc',
          shared: false,
        }));
      });

      it('does not alter associations for expanded association', () => {
        expect(Entity.associations.expandedAssoc).to.eql(Association({
          type: EntityAssociation,
          collection: true,
          notNull: true,
          from: 'expanded_assoc',
          shared: true,
        }));
      });

      it('creates an attributeNameMap property', () => {
        expect(Entity.attributeNameMap).to.eql({
          id: 'id',
          shorthand_attr: 'shorthandAttr',
          shorthand_collection_attr: 'shorthandCollectionAttr',
          expanded_attr: 'expandedAttr',
          shorthand_assoc: 'shorthandAssoc',
          shorthand_collection_assoc: 'shorthandCollectionAssoc',
          expanded_assoc: 'expandedAssoc',
        });
      });

      it('defaults to undefined or List() as default', () => {
        const entity = new Entity();

        expect(entity).to.eql(new Entity({
          shorthandAttr: undefined,
          shorthandCollectionAttr: List(),
          expandedAttr: List(),
          shorthandAssoc: undefined,
          shorthandCollectionAssoc: List(),
          expandedAssoc: List(),
        }));
      });
    });

    it('throws when trying to redefine a type', () => {
      vmClient.defineClass({ typeName: 'Entity', version: 1 });

      expect(
        () => vmClient.defineClass({ typeName: 'Entity', version: 1 }),
      ).to.throw(ViewModelClientError, /already been defined/);
    });

    it('throws when providing a non defined type in the registry', () => {
      expect(
        () => vmClient.defineClass({
          typeName: 'Broken',
          version: 1,
          associations: {
            unknown_association: Date,
          },
        }),
      ).to.throw(ViewModelClientError, /Type not in registry/);
    });

    it('throws when trying to extend a non defined type in the registry', () => {
      expect(
        () => vmClient.defineClass({
          typeName: 'Broken',
          version: 1,
          extends: Date,
        }),
      ).to.throw(ViewModelClientError, /extends not in registry/);
    });

    it('throws when there is no typename', () => {
      expect(
        () => vmClient.defineClass({}),
      ).to.throw(ViewModelClientError, /Expected typeName/);
    });

    it('throws when there is no version', () => {
      expect(
        () => vmClient.defineClass({ typeName: 'Text' }),
      ).to.throw(ViewModelClientError, /Expected version/);
    });

    it('throws when collection shorthand is invalid', () => {
      expect(
        () => vmClient.defineClass({
          typeName: 'Broken',
          version: 1,
          attributes: {
            invalidCollection: ['string', 1],
          },
        }),
      ).to.throw(ViewModelClientError, /Malformed collection attribute/);
    });

    it('throws without marshaller', () => {
      expect(
        () => vmClient.defineClass({
          typeName: 'Broken',
          version: 1,
          attributes: {
            field: Date,
          },
        }),
      ).to.throw(ViewModelClientError, /Constructor type not provided with a valid marshaller/);
    });

    it('throws when marshaller is missing serialize', () => {
      expect(
        () => vmClient.defineClass({
          typeName: 'Broken',
          version: 1,
          attributes: {
            field: {
              type: Date,
              marshaller: {
                deserialize: (x) => x,
              },
            },
          },
        }),
      ).to.throw(
        ViewModelClientError,
        /Marshaller requires both a deserialize and serialize method/,
      );
    });

    it('throws when marshaller is missing deserialize', () => {
      expect(
        () => vmClient.defineClass({
          typeName: 'Broken',
          version: 1,
          attributes: {
            field: {
              type: Date,
              marshaller: {
                serialize: (x) => x,
              },
            },
          },
        }),
      ).to.throw(
        ViewModelClientError,
        /Marshaller requires both a deserialize and serialize method/,
      );
    });

    it('throws when not given a primitive type as a string', () => {
      expect(
        () => vmClient.defineClass({
          typeName: 'Broken',
          version: 1,
          attributes: {
            field: 'what am I?',
          },
        }),
      ).to.throw(
        ViewModelClientError,
        /When providing a string, the type must one of/,
      );
    });

    it('allows passing another entity to the constructor', () => {
      const Test = vmClient.defineClass({
        typeName: 'Test',
        version: 1,
        attributes: {
          attr: 'string',
        },
      });

      const test1 = new Test({ attr: 'test' });
      const test2 = new Test(test1);

      expect(test1).to.equal(test2);
    });
  });

  describe('defineExternalAssociation', () => {
    let vmClient;
    let AssociationItem;

    beforeEach(() => {
      vmClient = new ViewModelClient();
      AssociationItem = vmClient.defineClass({
        typeName: 'AssociationItem',
        version: 1,
      });
    });

    it('returns a schema descriptor', () => {
      expect(
        vmClient.defineExternalAssociation({
          typeName: 'ExternalAssociation',
          associationType: AssociationItem,
        }),
      ).to.eql({
        kind: EXTERNAL_ASSOCIATION,
        typeName: 'ExternalAssociation',
        storePrefix: 'ExternalAssociation',
        associationType: AssociationItem,
      });
    });

    it('throws when trying to redefine a type', () => {
      vmClient.defineExternalAssociation({
        typeName: 'ExternalAssociation',
        associationType: AssociationItem,
      });

      expect(
        () => vmClient.defineExternalAssociation({
          typeName: 'ExternalAssociation',
          associationType: AssociationItem,
        }),
      ).to.throw(ViewModelClientError, /already been defined/);
    });

    it('throws when providing a non defined type in the registry', () => {
      expect(
        () => vmClient.defineExternalAssociation({
          typeName: 'Broken',
          associationType: Date,
        }),
      ).to.throw(ViewModelClientError, /Type not in registry/);
    });

    it('throws when there is no typename', () => {
      expect(
        () => vmClient.defineExternalAssociation({}),
      ).to.throw(ViewModelClientError, /Expected typeName/);
    });
  });

  describe('forEntity', () => {
    const vmClient = new ViewModelClient();

    const Image = vmClient.defineClass({
      typeName: 'Image',
      version: 1,
    });

    const Text = vmClient.defineClass({
      typeName: 'Text',
      version: 2,
    });

    it('returns an entity of type', () => {
      expect(vmClient.forEntity({ _type: 'Image', _version: 1 })).to.equal(Image);
      expect(vmClient.forEntity({ _type: 'Text', _version: 2 })).to.equal(Text);
    });

    it('throws when there is no typename', () => {
      expect(
        () => vmClient.forEntity({ _type: 'Bogus', _version: 1 }),
      ).to.throw(ViewModelClientError, /Unable to find type for/);
    });

    it('throws when version numbers mismatch', () => {
      expect(
        () => vmClient.forEntity({ _type: 'Text', _version: 1 }),
      ).to.throw(ViewModelClientError, /Mismatched versions on type/);
    });
  });
});
