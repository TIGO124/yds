import { KONULAR, SORULAR } from './data/bank';
import { YdsDB } from './db/db';
import { Depo } from './db/depo';

export const depo = new Depo(new YdsDB(), { sorular: SORULAR, konular: KONULAR });
