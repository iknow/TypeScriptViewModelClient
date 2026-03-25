import { expect } from 'chai';
import * as v from '../index';

describe('getEntityVersions', () => {
  it('includes all nested children', () => {
    const Grandchild1 = v.entityConstructor({
      typeName: 'Grandchild1',
      version: 1,
      fields: {
        id: v.opt(v.string),
      },
    });

    const Grandchild2 = v.entityConstructor({
      typeName: 'Grandchild2',
      version: 2,
      fields: {
        id: v.opt(v.string),
      },
    });

    const Child1 = v.entityConstructor({
      typeName: 'Child1',
      version: 3,
      fields: {
        id: v.opt(v.string),
        grandchild1: v.nested(Grandchild1),
        grandchild2: v.nested(Grandchild2),
      },
    });

    const Child2 = v.entityConstructor({
      typeName: 'Child2',
      version: 4,
      fields: {
        id: v.opt(v.string),
      },
    });

    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 5,
      fields: {
        id: v.opt(v.string),
        child1: v.nested(Child1),
        child2: v.nested(Child2),
      },
    });

    expect(v.getEntityVersions(v.nested(Grandchild1))).to.deep.equal({
      Grandchild1: 1,
    });
    expect(v.getEntityVersions(v.nested(Grandchild2))).to.deep.equal({
      Grandchild2: 2,
    });
    expect(v.getEntityVersions(v.nested(Child1))).to.deep.equal({
      Grandchild1: 1,
      Grandchild2: 2,
      Child1: 3,
    });
    expect(v.getEntityVersions(v.nested(Child2))).to.deep.equal({
      Child2: 4,
    });
    expect(v.getEntityVersions(v.nested(Parent))).to.deep.equal({
      Grandchild1: 1,
      Grandchild2: 2,
      Child1: 3,
      Child2: 4,
      Parent: 5,
    });
  });

  it('includes all nested children with handles', () => {
    const Grandchild1 = v.entityConstructor({
      typeName: 'Grandchild1',
      version: 1,
      fields: {
        id: v.opt(v.string),
      },
    });

    const Grandchild2 = v.entityConstructor({
      typeName: 'Grandchild2',
      version: 2,
      fields: {
        id: v.opt(v.string),
      },
    });

    const Child1 = v.entityConstructor({
      typeName: 'Child1',
      version: 3,
      fields: {
        id: v.opt(v.string),
        grandchild1: v.handle(Grandchild1),
        grandchild2: v.handle(Grandchild2),
      },
    });

    const Child2 = v.entityConstructor({
      typeName: 'Child2',
      version: 4,
      fields: {
        id: v.opt(v.string),
      },
    });

    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 5,
      fields: {
        id: v.opt(v.string),
        child1: v.handle(Child1),
        child2: v.handle(Child2),
      },
    });

    expect(v.getEntityVersions(v.nested(Grandchild1))).to.deep.equal({
      Grandchild1: 1,
    });
    expect(v.getEntityVersions(v.nested(Grandchild2))).to.deep.equal({
      Grandchild2: 2,
    });
    expect(v.getEntityVersions(v.nested(Child1))).to.deep.equal({
      Grandchild1: 1,
      Grandchild2: 2,
      Child1: 3,
    });
    expect(v.getEntityVersions(v.nested(Child2))).to.deep.equal({
      Child2: 4,
    });
    expect(v.getEntityVersions(v.nested(Parent))).to.deep.equal({
      Grandchild1: 1,
      Grandchild2: 2,
      Child1: 3,
      Child2: 4,
      Parent: 5,
    });
  });

  it('follows shared children', () => {
    const SharedChild1 = v.entityConstructor({
      typeName: 'SharedChild1',
      version: 1,
      fields: {
        id: v.opt(v.string),
      },
    });

    const SharedChild2 = v.entityConstructor({
      typeName: 'SharedChild2',
      version: 2,
      fields: {
        id: v.opt(v.string),
      },
    });

    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 3,
      fields: {
        id: v.opt(v.string),
        sharedChild: v.handle(SharedChild1),
        sharedChildren: v.associationList(v.handle(SharedChild2)),
      },
    });

    expect(v.getEntityVersions(v.nested(Parent))).to.deep.equal({
      SharedChild1: 1,
      SharedChild2: 2,
      Parent: 3,
    });
  });

  it('does not include undefined versions', () => {
    const Child = v.entityConstructor({
      typeName: 'Child',
      version: undefined,
      fields: {
        id: v.opt(v.string),
      },
    });

    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 2,
      fields: {
        id: v.opt(v.string),
        child: v.handle(Child),
      },
    });

    expect(v.getEntityVersions(v.nested(Parent))).to.deep.equal({
      Parent: 2,
    });
  });

  it('works with union associations', () => {
    const Child1 = v.entityConstructor({
      typeName: 'Child1',
      version: 1,
      fields: {
        id: v.opt(v.string),
      },
    });

    const Child2 = v.entityConstructor({
      typeName: 'Child2',
      version: 2,
      fields: {
        id: v.opt(v.string),
      },
    });

    const Supertype = v.entityConstructor({
      typeName: 'Supertype',
      version: 3,
      fields: {
        id: v.opt(v.string),
        supertypeChild: v.handle(Child1),
      },
    });

    const Subtype1 = v.entityConstructor({
      typeName: 'Subtype1',
      version: 4,
      fields: {
        ...Supertype.fields,
        subtypeChild: v.handle(Child2),
      },
    });

    const Subtype2 = v.entityConstructor({
      typeName: 'Subtype2',
      version: 5,
      fields: {
        ...Supertype.fields,
      },
    });

    const Parent = v.entityConstructor({
      typeName: 'Parent',
      version: 6,
      fields: {
        id: v.opt(v.string),
        child: v.union([
          v.handle(Supertype),
          v.handle(Subtype1),
          v.handle(Subtype2),
        ]),
      },
    });

    expect(v.getEntityVersions(v.nested(Subtype1))).to.deep.equal({
      Child1: 1,
      Child2: 2,
      Subtype1: 4,
    });

    expect(v.getEntityVersions(v.nested(Subtype2))).to.deep.equal({
      Child1: 1,
      Subtype2: 5,
    });

    expect(v.getEntityVersions(v.nested(Parent))).to.deep.equal({
      Child1: 1,
      Child2: 2,
      Supertype: 3,
      Subtype1: 4,
      Subtype2: 5,
      Parent: 6,
    });
  });

  it('works if multiple fields reference the same type', () => {
    const Child = v.entityConstructor({
      typeName: 'Child',
      version: 1,
      fields: {
        id: v.opt(v.string),
      },
    });

    const Parent1 = v.entityConstructor({
      typeName: 'Parent1',
      version: 2,
      fields: {
        id: v.opt(v.string),
        child: v.handle(Child),
      },
    });

    const Parent2 = v.entityConstructor({
      typeName: 'Parent2',
      version: 3,
      fields: {
        id: v.opt(v.string),
        child: v.handle(Child),
        children: v.associationList(v.handle(Child)),
        parent1: v.handle(Parent1),
      },
    });

    expect(v.getEntityVersions(v.nested(Parent2))).to.deep.equal({
      Child: 1,
      Parent1: 2,
      Parent2: 3,
    });
  });

  it('accepts arbitrary codec', () => {
    expect(v.getEntityVersions(v.array(v.unknown))).to.deep.equal({});
    expect(v.getEntityVersions(v.list(v.unknown))).to.deep.equal({});

    const Child1 = v.entityConstructor({
      typeName: 'Child1',
      version: 1,
      fields: {
        id: v.opt(v.string),
      },
    });

    const Parent1 = v.entityConstructor({
      typeName: 'Parent1',
      version: 2,
      fields: {
        id: v.opt(v.string),
        child: v.handle(Child1),
      },
    });

    const Child2 = v.entityConstructor({
      typeName: 'Child2',
      version: 3,
      fields: {
        id: v.opt(v.string),
      },
    });

    const Parent2 = v.entityConstructor({
      typeName: 'Parent2',
      version: 4,
      fields: {
        id: v.opt(v.string),
        child: v.handle(Child2),
      },
    });

    expect(v.getEntityVersions(
      v.tuple([v.nested(Parent1), v.nested(Parent2)]),
    )).to.deep.equal({
      Child1: 1,
      Parent1: 2,
      Child2: 3,
      Parent2: 4,
    });
  });
});
