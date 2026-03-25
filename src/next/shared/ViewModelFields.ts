/**
 * Reserved fields that the backend view model library produces or consumes.
 */
const ViewModelFields = Object.freeze({
  // Not using an enum because each of these fields are unrelated and a
  // `ViewModelFields` type wouldn't really make sense. Still, use an object for
  // namespacing.
  /* eslint-disable @typescript-eslint/naming-convention */
  New: '_new',
  Type: '_type',
  Version: '_version',
  Ref: '_ref',
  Migrated: '_migrated',
  Update: '_update',
  Values: 'values',
  Id: 'id',
  Actions: 'actions',
  Before: 'before',
  After: 'after',
  /* eslint-enable @typescript-eslint/naming-convention */
} as const);

export default ViewModelFields;
