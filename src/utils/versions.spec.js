import { expect } from 'chai';
import { List } from 'immutable';
import ViewModelClient from '../';
import { calculateVersions } from './versions';

describe('calculateVersions', () => {
  it('includes all nested children', () => {
    const vmClient = new ViewModelClient();

    const Grandchild1 = vmClient.defineClass({
      typeName: 'Grandchild1',
      version: 1,
      persisted: true,
    });

    const Grandchild2 = vmClient.defineClass({
      typeName: 'Grandchild2',
      version: 2,
      persisted: true,
    });

    const Child1 = vmClient.defineClass({
      typeName: 'Child1',
      version: 3,
      persisted: true,
      associations: {
        grandchild1: Grandchild1,
        grandchild2: Grandchild2,
      },
    });

    const Child2 = vmClient.defineClass({
      typeName: 'Child2',
      version: 4,
      persisted: true,
    });

    const Parent = vmClient.defineClass({
      typeName: 'Parent',
      version: 5,
      persisted: true,
      associations: {
        child1: Child1,
        child2: Child2,
      },
    });

    expect(calculateVersions(Grandchild1)).to.deep.equal({
      Grandchild1: 1,
    });
    expect(calculateVersions(Grandchild2)).to.deep.equal({
      Grandchild2: 2,
    });
    expect(calculateVersions(Child1)).to.deep.equal({
      Grandchild1: 1,
      Grandchild2: 2,
      Child1: 3,
    });
    expect(calculateVersions(Child2)).to.deep.equal({
      Child2: 4,
    });
    expect(calculateVersions(Parent)).to.deep.equal({
      Grandchild1: 1,
      Grandchild2: 2,
      Child1: 3,
      Child2: 4,
      Parent: 5,
    });
  });

  it('follows shared children', () => {
    const vmClient = new ViewModelClient();

    const SharedChild1 = vmClient.defineClass({
      typeName: 'SharedChild1',
      version: 1,
      persisted: true,
      shared: true,
    });

    const SharedChild2 = vmClient.defineClass({
      typeName: 'SharedChild2',
      version: 2,
      persisted: true,
      shared: true,
    });

    const Parent = vmClient.defineClass({
      typeName: 'Parent',
      version: 3,
      persisted: true,
      associations: {
        sharedChild: { type: SharedChild1, shared: true },
        sharedChildren: { type: SharedChild2, collection: true, shared: true },
      },
    });

    expect(calculateVersions(Parent)).to.deep.equal({
      SharedChild1: 1,
      SharedChild2: 2,
      Parent: 3,
    });
  });

  it('works with external associations', () => {
    const vmClient = new ViewModelClient();

    const Child = vmClient.defineClass({
      typeName: 'Child',
      version: 1,
      persisted: true,
    });

    const Parent = vmClient.defineClass({
      typeName: 'Parent',
      version: 2,
      persisted: true,
      associations: {
        child: Child,
      },
    });

    const ExternalAssociation = vmClient.defineExternalAssociation({
      typeName: 'ExternalAssociation',
      associationType: Parent,
    });

    expect(calculateVersions(ExternalAssociation)).to.deep.equal({
      Child: 1,
      Parent: 2,
    });
  });

  it('works with subtypes', () => {
    const vmClient = new ViewModelClient();

    const Child1 = vmClient.defineClass({
      typeName: 'Child1',
      version: 1,
      persisted: true,
    });

    const Child2 = vmClient.defineClass({
      typeName: 'Child2',
      version: 2,
      persisted: true,
    });

    const Supertype = vmClient.defineClass({
      typeName: 'Supertype',
      version: 3,
      persisted: true,
      associations: {
        supertypeChild: Child1,
      },
    });

    const Subtype1 = vmClient.defineClass({
      typeName: 'Subtype1',
      version: 4,
      persisted: true,
      extends: Supertype,
      associations: {
        subtypeChild: Child2,
      },
    });

    const Subtype2 = vmClient.defineClass({
      typeName: 'Subtype2',
      version: 5,
      persisted: true,
      extends: Supertype,
    });

    const Parent = vmClient.defineClass({
      typeName: 'Parent',
      version: 6,
      persisted: true,
      associations: {
        child: Supertype,
      },
    });

    expect(calculateVersions(Subtype1)).to.deep.equal({
      Child1: 1,
      Child2: 2,
      Subtype1: 4,
    });

    expect(calculateVersions(Subtype2)).to.deep.equal({
      Child1: 1,
      Subtype2: 5,
    });

    expect(calculateVersions(Parent)).to.deep.equal({
      Child1: 1,
      Child2: 2,
      Supertype: 3,
      Subtype1: 4,
      Subtype2: 5,
      Parent: 6,
    });
  });

  it('works if multiple fields reference the same type', () => {
    const vmClient = new ViewModelClient();

    const Child = vmClient.defineClass({
      typeName: 'Child',
      version: 1,
      persisted: true,
    });

    const Parent1 = vmClient.defineClass({
      typeName: 'Parent1',
      version: 2,
      persisted: true,
      associations: {
        child: Child,
      },
    });

    const Parent2 = vmClient.defineClass({
      typeName: 'Parent2',
      version: 3,
      persisted: true,
      associations: {
        child: Child,
        children: [Child],
        parent1: Parent1,
      },
    });

    expect(calculateVersions(Parent2)).to.deep.equal({
      Child: 1,
      Parent1: 2,
      Parent2: 3,
    });
  });

  it('accepts arrays and lists', () => {
    const vmClient = new ViewModelClient();

    expect(calculateVersions([])).to.deep.equal({});
    expect(calculateVersions(List())).to.deep.equal({});

    const Child1 = vmClient.defineClass({
      typeName: 'Child1',
      version: 1,
      persisted: true,
    });

    const Parent1 = vmClient.defineClass({
      typeName: 'Parent1',
      version: 2,
      persisted: true,
      associations: {
        child: Child1,
      },
    });

    const Child2 = vmClient.defineClass({
      typeName: 'Child2',
      version: 3,
      persisted: true,
    });

    const Parent2 = vmClient.defineClass({
      typeName: 'Parent2',
      version: 4,
      persisted: true,
      associations: {
        child: Child2,
      },
    });

    const versions = {
      Child1: 1,
      Parent1: 2,
      Child2: 3,
      Parent2: 4,
    };
    expect(calculateVersions([Parent1, Parent2])).to.deep.equal(versions);
    expect(calculateVersions(List([Parent1, Parent2]))).to.deep.equal(versions);
  });
});
