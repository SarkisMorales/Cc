import { run, press, newState } from '../engine.js';
import assert from 'node:assert/strict';

const k = (str) => str.split(' ').filter(Boolean);
const val = (keys, mode) => { const s = run(k(keys), { mode }); return s.error ? 'E:' + s.error : Number(s.cur); };
let n = 0;
const eq = (keys, mode, exp) => { n++; assert.equal(val(keys, mode), exp, `${mode}: ${keys}`); };

for (const m of ['ios', 'win']) {
  eq('1 2 + 3 =', m, 15);
  eq('0 . 1 + 0 . 2 =', m, 0.3);
  eq('2 + 3 = = =', m, 11);
  eq('2 × =', m, 4);
  eq('2 + 3 = 7 =', m, 10);
  eq('5 ÷ 0 =', m, 'E:div0');
  eq('5 ÷ 0 = 3', m, 3);
  eq('5 0 + 1 0 % =', m, 55);
  eq('5 0 × 1 0 % =', m, 5);
  eq('9 neg', m, -9);
  eq('9 back', m, 0);
  eq('1 2 3 back =', m, 12);
  eq('2 + × 3 =', m, 6);
  eq('1 0 − 4 =', m, 6);
  eq('7 ÷ 2 =', m, 3.5);
  eq('1 . . 5 + 1 =', m, 2.5);
  eq('2 + 3 = + 1 =', m, 6);
  eq('2 + neg 3 =', m, -1);
}
eq('2 + 3 × 4 =', 'ios', 14);
eq('2 + 3 × 4 =', 'win', 20);
eq('2 + 3 ×', 'ios', 3);
eq('2 × 3 +', 'ios', 6);
eq('2 + 3 ×', 'win', 5);
eq('9 sqrt', 'win', 3);
eq('4 inv', 'win', 0.25);
eq('5 sq + 1 =', 'win', 26);
eq('2 neg sqrt', 'win', 'E:invalid');
eq('1 2 3 4 5 6 7 8 9 0', 'ios', 123456789);
eq('5 ms 3 m+ ac mr', 'win', 8);

// labels + done text
const s = run(k('9 sqrt + 1 ='), { mode: 'win' });
assert.equal(s.done, '√(9) + 1 =');
assert.equal(s.history[0].result, 4);
// error keeps memory
const e = run(k('5 ms 1 ÷ 0 ='), { mode: 'win' });
assert.equal(e.memory, 5);
// opPending
assert.equal(run(k('2 +'), {}).opPending, true);
assert.equal(run(k('2 + 3'), {}).opPending, false);
console.log('OK', n + 4, 'tests');
