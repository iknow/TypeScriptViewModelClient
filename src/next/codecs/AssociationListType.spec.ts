import { expect } from 'chai';
import { List } from 'immutable';
import { longestCommonSubsequence } from './AssociationListType';

describe('longestCommonSubsequence', () => {
  it('works', () => {
    expect(longestCommonSubsequence(
      List([1, 2, 3]),
      List([2, 3, 4]),
    ).toJS()).to.deep.equal(
      List([2, 3]).toJS(),
    );

    expect(longestCommonSubsequence(
      List([1, 2]),
      List([1, 3]),
    ).toJS()).to.deep.equal(
      List([1]).toJS(),
    );
  });
});
