// make.fun tiny stack ISA v1 (ISA.md): wrapping 32-bit arithmetic, 256-deep data stack, 64
// call frames, 256 words, ten traps, step and output limits, in the order ISA.md states them.
import { mkdirSync, readdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function run(prog, input) {
  const st = new Int32Array(256);
  const mem = new Int32Array(256);
  const ret = new Int32Array(64);
  const out = new Uint8Array(65536);
  let sp = 0, cp = 0, pc = 0, ip = 0, op = 0, steps = 0, code = -1;
  const n = prog.length;
  const trap = (c) => { code = c; return true; };
  const need = (pop, push) => {
    if (sp < pop) return 2;
    if (sp - pop + push > 256) return 3;
    return 0;
  };
  const push = (v) => { st[sp++] = v | 0; };
  const pop = () => st[--sp] | 0;

  while (true) {
    if (steps >= 1e6) { trap(10); break; }
    if (pc < 0 || pc >= n) { trap(9); break; }
    const b = prog[pc];
    let im = 0, sz = 0, f = 0;
    switch (b) {
      case 0x01: sz = 1; break;
      case 0x02: sz = 4; break;
      case 0x30: case 0x31: case 0x32: case 0x33: sz = 2; break;
      default: break;
    }
    if (sz && pc + sz >= n) { trap(9); break; }
    const next = pc + 1 + sz;
    const known = b === 0x00 || (b >= 0x01 && b <= 0x07) || (b >= 0x10 && b <= 0x1e) ||
      (b >= 0x20 && b <= 0x22) || (b >= 0x30 && b <= 0x34) || (b >= 0x40 && b <= 0x41) || (b >= 0x50 && b <= 0x53);
    if (!known) { trap(5); break; }
    if (sz === 1) im = (prog[pc + 1] << 24) >> 24;
    else if (sz === 4) im = prog[pc + 1] | (prog[pc + 2] << 8) | (prog[pc + 3] << 16) | (prog[pc + 4] << 24);
    else if (sz === 2) { const u = prog[pc + 1] | (prog[pc + 2] << 8); im = b === 0x33 ? u : (u << 16) >> 16; }

    pc = next;
    switch (b) {
      case 0x00: code = 0; break;
      case 0x01: case 0x02: f = need(0, 1); if (f) { trap(f); break; } push(im); break;
      case 0x03: f = need(1, 0); if (f) { trap(f); break; } pop(); break;
      case 0x04: f = need(1, 2); if (f) { trap(f); break; } push(st[sp - 1]); break;
      case 0x05: f = need(2, 2); if (f) { trap(f); break; } { const a = st[sp - 2], c = st[sp - 1]; st[sp - 2] = c; st[sp - 1] = a; } break;
      case 0x06: f = need(2, 3); if (f) { trap(f); break; } push(st[sp - 2]); break;
      case 0x07: f = need(3, 3); if (f) { trap(f); break; } { const a = st[sp - 3], c = st[sp - 2], d = st[sp - 1]; st[sp - 3] = c; st[sp - 2] = d; st[sp - 1] = a; } break;
      case 0x10: f = need(2, 1); if (f) { trap(f); break; } { const x = pop(), y = pop(); push((x + y) | 0); } break;
      case 0x11: f = need(2, 1); if (f) { trap(f); break; } { const x = pop(), y = pop(); push((y - x) | 0); } break;
      case 0x12: f = need(2, 1); if (f) { trap(f); break; } { const x = pop(), y = pop(); push(Math.imul(y, x)); } break;
      case 0x13: case 0x14: {
        f = need(2, 1); if (f) { trap(f); break; }
        const x = pop(), y = pop();
        if (x === 0) { trap(4); break; }
        push(b === 0x13 ? (Math.trunc(y / x) | 0) : ((y % x) | 0));
        break;
      }
      case 0x15: case 0x16: {
        f = need(2, 1); if (f) { trap(f); break; }
        const x = pop() >>> 0, y = pop() >>> 0;
        if (x === 0) { trap(4); break; }
        push(b === 0x15 ? (Math.floor(y / x) | 0) : ((y % x) | 0));
        break;
      }
      case 0x17: f = need(1, 1); if (f) { trap(f); break; } st[sp - 1] = (-st[sp - 1]) | 0; break;
      case 0x18: f = need(2, 1); if (f) { trap(f); break; } { const x = pop(), y = pop(); push(y & x); } break;
      case 0x19: f = need(2, 1); if (f) { trap(f); break; } { const x = pop(), y = pop(); push(y | x); } break;
      case 0x1a: f = need(2, 1); if (f) { trap(f); break; } { const x = pop(), y = pop(); push(y ^ x); } break;
      case 0x1b: f = need(1, 1); if (f) { trap(f); break; } st[sp - 1] = ~st[sp - 1]; break;
      case 0x1c: f = need(2, 1); if (f) { trap(f); break; } { const x = pop(), y = pop(); push(y << (x & 31)); } break;
      case 0x1d: f = need(2, 1); if (f) { trap(f); break; } { const x = pop(), y = pop(); push(y >> (x & 31)); } break;
      case 0x1e: f = need(2, 1); if (f) { trap(f); break; } { const x = pop(), y = pop(); push((y >>> (x & 31)) | 0); } break;
      case 0x20: f = need(2, 1); if (f) { trap(f); break; } { const x = pop(), y = pop(); push(y === x ? 1 : 0); } break;
      case 0x21: f = need(2, 1); if (f) { trap(f); break; } { const x = pop(), y = pop(); push(y < x ? 1 : 0); } break;
      case 0x22: f = need(2, 1); if (f) { trap(f); break; } { const x = pop() >>> 0, y = pop() >>> 0; push(y < x ? 1 : 0); } break;
      case 0x30: pc = (next + im) | 0; break;
      case 0x31: f = need(1, 0); if (f) { trap(f); break; } if (pop() === 0) pc = (next + im) | 0; break;
      case 0x32: f = need(1, 0); if (f) { trap(f); break; } if (pop() !== 0) pc = (next + im) | 0; break;
      case 0x33: if (cp >= 64) { trap(7); break; } ret[cp++] = next; pc = im; break;
      case 0x34: if (cp === 0) { trap(8); break; } pc = ret[--cp]; break;
      case 0x40: {
        f = need(1, 1); if (f) { trap(f); break; }
        const a = pop();
        if (a < 0 || a > 255) { trap(6); break; }
        push(mem[a]); break;
      }
      case 0x41: {
        f = need(2, 0); if (f) { trap(f); break; }
        const a = pop(), v = pop();
        if (a < 0 || a > 255) { trap(6); break; }
        mem[a] = v; break;
      }
      case 0x50: {
        f = need(1, 0); if (f) { trap(f); break; }
        const v = pop();
        const s = String(v);
        if (op + s.length > 65536) { trap(11); break; }
        for (let k = 0; k < s.length; k++) out[op++] = s.charCodeAt(k);
        break;
      }
      case 0x51: f = need(1, 0); if (f) { trap(f); break; } { const v = pop(); if (op + 1 > 65536) { trap(11); break; } out[op++] = v & 255; } break;
      case 0x52: f = need(0, 1); if (f) { trap(f); break; } push(ip < input.length ? input[ip++] : -1); break;
      case 0x53: f = need(1, 0); if (f) { trap(f); break; } code = pop() & 255; break;
    }
    if (code >= 0) break;
    steps++;
  }
  return { out: out.subarray(0, op), code: code < 0 ? 0 : code };
}

for (const id of readdirSync(I).sort()) {
  const d = join(I, id);
  if (!existsSync(join(d, 'program.bin'))) continue;
  const r = run(readFileSync(join(d, 'program.bin')), existsSync(join(d, 'input.bin')) ? readFileSync(join(d, 'input.bin')) : Buffer.alloc(0));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), String(r.code) + '\n');
}
