import * as chai from 'chai';
import chaiImmutable from 'chai-immutable';
import * as Hojicha from '@engoo/hojicha';
import { describe, it } from 'mocha';

chai.use(chaiImmutable);
Hojicha.installTestDriver({ describe, it });
