// This file only validates types and is more conveniently written unsafely
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as v from '../index';

// This is only used to validate that `IEntityConstructor extends IAnyEntityConstructor`
(() => {
  const a: v.IEntityConstructor<{ id: v.StringType; }, 'Test'> = null as any;
  const b: v.IAnyEntityConstructor = a;
  b; // Silence unused variable warning
});
