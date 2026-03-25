import { expect } from 'chai';
import ViewModelClient from '../';
import { Attribute, Association } from '../utils/schema';
import { AttributeAssignmentError, AssociationAssignmentError } from './validate';

describe('AttributeAssignmentError', () => {
  it('correctly serializes class types', () => {
    function FakeDate() {}
    const attribute = new Attribute({ type: Date });

    expect((
      new AttributeAssignmentError(attribute, new FakeDate(), 'Type', 'field', 'id')
    ).message).to.equal(
      'Error on Type(id)[field]. Expected Date, but got FakeDate.',
    );
  });

  it('correctly serializes primitive types', () => {
    const attribute = new Attribute({ type: 'string' });

    expect((
      new AttributeAssignmentError(attribute, 1, 'Type', 'field', 'id')
    ).message).to.equal(
      'Error on Type(id)[field]. Expected string, but got number.',
    );
  });
});

describe('AssociationAssignmentError', () => {
  it('correctly serializes association types', () => {
    function FakeAssociation() {}
    const vmClient = new ViewModelClient();
    const TestAssociation = vmClient.defineClass({
      typeName: 'TestAssociation',
      version: 1,
      attributes: {
        value: 'string',
      },
    });
    const association = new Association({ type: TestAssociation });

    expect((
      new AssociationAssignmentError(association, new FakeAssociation(), 'Type', 'field', 'id')
    ).message).to.equal(
      'Error on Type(id)[field]. Expected TestAssociation, but got FakeAssociation.',
    );
  });
});
