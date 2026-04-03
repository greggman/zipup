/* global chai, describe, it */
let assert;
if (typeof chai !== 'undefined') {
  assert = chai.assert;
} else {
  import('chai')
    .then(mod => {
      assert = mod.assert;
    })
    .catch(() => {
      // let the test runner show import errors
    });
}

import {Zip, DosAttributes, UnixPermissions} from '../../dist/zipup.module.js';
import { unzip } from '../3rdparty/unzipit.module.js';

function rejects(promise) {
  return promise.then(
    () => {
      throw new Error('Expected promise to reject');
    },
    err => err,
  );
}

describe('zipup', function() {
  it('handles string input in browser', async() => {
    const z = new Zip();
    await z.addFile('s.txt', 'hello');
    const blob = await z.finalize();
    assert.instanceOf(blob, Blob);
    const out = await unzip(blob);
    const e = out.entries['s.txt'];
    assert.ok(e);
    const t = await e.text();
    assert.equal(t, 'hello');
  });

  it('handles ArrayBuffer and views in browser', async() => {
    const z = new Zip();
    const ab = new Uint8Array([1, 2, 3]).buffer;
    await z.addFile('b.bin', ab);
    const u = new Uint8Array([4, 5, 6]);
    await z.addFile('u.bin', u);
    const f = new Float32Array([1.5, -2.5]);
    await z.addFile('f.bin', f);
    const blobIn = new Blob([new Uint8Array([7, 8, 9])]);
    await z.addFile('blob.bin', blobIn);

    const blob = await z.finalize();
    const out = await unzip(blob);

    let e = out.entries['b.bin'];
    assert.ok(e);
    assert.deepEqual(Array.from(new Uint8Array(await e.arrayBuffer())), [1, 2, 3]);

    e = out.entries['u.bin'];
    assert.ok(e);
    assert.deepEqual(Array.from(new Uint8Array(await e.arrayBuffer())), [4, 5, 6]);

    e = out.entries['f.bin'];
    assert.ok(e);
    const gotF = new Float32Array(await e.arrayBuffer());
    assert.equal(gotF.length, f.length);
    for (let i = 0; i < gotF.length; i++) {
      assert.approximately(gotF[i], f[i], 1e-6);
    }

    e = out.entries['blob.bin'];
    assert.ok(e);
    assert.deepEqual(Array.from(new Uint8Array(await e.arrayBuffer())), [7, 8, 9]);
  });

  it('throws if usage after finalized', async() => {
    const z = new Zip();
    await z.addFile('s.txt', 'hello');
    await z.finalize();
    await rejects(z.finalize(), 'Zip already finalized');
    await rejects(z.addFile('f.txt', 'world'), 'Zip already finalized');
  });

});

describe('zipup folders', function() {
  it('preserves explicit folder entries', async() => {
    const z = new Zip();
    z.addFolder('empty/');
    await z.addFile('dir/f.txt', 'ok');
    const blob = await z.finalize();
    const out = await unzip(blob);
    const d = out.entries['empty/'];
    assert.ok(d);
    assert.ok(d.isDirectory);
    const f = out.entries['dir/f.txt'];
    assert.ok(f);
    const t = await f.text();
    assert.equal(t, 'ok');
  });

  it('preserves folder entries via ZipFolder API', async() => {
    const z = new Zip();
    const folder = z.addFolder('a');
    folder.addFile('b.txt', 'hello');
    const blob = await z.finalize();
    const out = await unzip(blob);
    const d = out.entries['a/'];
    assert.ok(d);
    assert.ok(d.isDirectory);
    const f = out.entries['a/b.txt'];
    assert.ok(f);
    const t = await f.text();
    assert.equal(t, 'hello');
  });

});

describe('sanitizePath filtering', function() {
  it('strips NUL/control chars from names', async() => {
    const z = new Zip();
    await z.addFile('bad\u0000name.txt', 'x');
    const blob = await z.finalize();
    const out = await unzip(blob);
    assert.ok(out.entries['badname.txt']);
  });

  it('rejects names containing disallowed characters', async() => {
    const z = new Zip();
    await rejects(z.addFile('bad<name.txt', 'x'));
    await rejects(z.addFile('bad:name.txt', 'x'));
    await rejects(z.addFile('bad?.txt', 'x'));
  });

  it('strips trailing dots and spaces in components', async() => {
    const z = new Zip();
    await z.addFile('trailing./f.txt', 'v');
    await z.addFile('space /g.txt', 'w');
    const blob = await z.finalize();
    const out = await unzip(blob);
    assert.ok(out.entries['trailing/f.txt']);
    assert.ok(out.entries['space/g.txt']);
  });

  it('rejects reserved device names', async() => {
    const z = new Zip();
    await rejects(z.addFile('CON/file.txt', 'x'));
    await rejects(z.addFile('aux', 'x'));
  });
});

describe('zipup large blob', function() {
  it('handles large blob (~100MB)', async function() {
    this.timeout(5 * 60 * 1000);

    const MB = 1024 * 1024;
    const parts = [];
    for (let i = 0; i < 100; i++) {
      const arr = new Uint8Array(MB);
      arr.fill(i & 0xff);
      parts.push(arr);
    }

    const blob = new Blob(parts);

    const z = new Zip();
    await z.addFile('big.bin', blob);
    const outBlob = await z.finalize();

    const out = await unzip(outBlob);
    const e = out.entries['big.bin'];
    assert.ok(e);
    assert.isBelow(e.compressedSize, e.size * 0.1, 'should be significantly compressed');
    const got = new Uint8Array(await e.arrayBuffer());
    assert.equal(got.length, 100 * MB);
    // verify entire contents: each MB chunk was filled with the chunk index byte
    for (let i = 0; i < got.length; i++) {
      const expected = (Math.floor(i / MB) & 0xff);
      if (got[i] !== expected) {
        assert.fail(`byte mismatch at ${i}: ${got[i]} !== ${expected}`);
      }
    }
  });
});

describe('zipup metadata and comments', function() {
  it('preserves lastModDate on entry', async() => {
    const d = new Date(2020, 1, 2, 3, 4, 6);
    const z = new Zip();
    await z.addFile({ name: 'date.txt', lastModDate: d }, 'x');
    const blob = await z.finalize();
    const out = await unzip(blob);
    const e = out.entries['date.txt'];
    assert.ok(e);
    // DOS datetime has 2-second granularity; allow up to 2s difference
    const diff = Math.abs(e.lastModDate.getTime() - d.getTime());
    assert.ok(diff < 2000);
  });

  it('preserves entry comment', async() => {
    const z = new Zip();
    await z.addFile({ name: 'with-comment.txt', comment: 'ヘロー項目' }, 'v');
    const blob = await z.finalize();
    const out = await unzip(blob);
    const e = out.entries['with-comment.txt'];
    assert.ok(e);
    assert.equal(e.comment, 'ヘロー項目');
  });

  it('throws when entry comment too long', async() => {
    const longComment = 'a'.repeat(70000);
    const z = new Zip();
    await z.addFile({ name: 'big-comment.txt', comment: longComment }, 'x');
    let threw = false;
    try {
      await z.finalize();
    } catch (e) {
      threw = true;
      assert.instanceOf(e, RangeError);
    }
    assert.ok(threw);
  });

  it('preserves zip comment', async() => {
    const z = new Zip();
    await z.addFile('a.txt', 'b');
    const blob = await z.finalize('zip-コメント');
    const out = await unzip(blob);
    assert.equal(out.zip.comment, 'zip-コメント');
  });

  it('handles unicode filenames', async() => {
    const name = 'ファイル.txt';
    const z = new Zip();
    await z.addFile(name, 'data');
    const blob = await z.finalize();
    const out = await unzip(blob);
    const e = out.entries[name];
    assert.ok(e);
    const t = await e.text();
    assert.equal(t, 'data');
  });
});

describe('zipup zip64 support', function() {
  before(function() {
    if (typeof window !== 'undefined' && typeof URLSearchParams !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('zip64')) {
        return;
      }
    }
    this.skip();
  });

  it('roundtrips >0xFFFE entries (triggers ZIP64)', async function() {
    this.timeout(5 * 60 * 1000);
    const count = 0x10010; // > 0xFFFE
    const z = new Zip();
    for (let i = 0; i < count; i++) {
      await z.addFile(`file-${i}.txt`, 'x');
    }
    const blob = await z.finalize();
    const out = await unzip(blob);
    const keys = Object.keys(out.entries);
    assert.equal(keys.length, count);
    // spot check first and last
    assert.ok(out.entries['file-0.txt']);
    assert.ok(out.entries[`file-${count - 1}.txt`]);
  });

  // runs out of memory.
  it('handles single entry >4GB using ZIP64', async function() {
    this.timeout(10 * 60 * 1000);
    const MB = 1024 * 1024;
    // make a 64MB pattern blob
    const base = new Uint8Array(64 * MB);
    for (let i = 0; i < base.length; i++) {
      base[i] = i & 0xff;
    }
    const b = new Blob([base]);
    // repeat the same blob reference to create >4GB without duplicating memory
    const repeats = 70; // 70 * 64MB ~= 4.48GB
    const parts = new Array(repeats).fill(b);
    const big = new Blob(parts);

    const z = new Zip();
    await z.addFile('huge.bin', big);
    const outBlob = await z.finalize();

    const out = await unzip(outBlob);
    const e = out.entries['huge.bin'];
    assert.ok(e);
    const gotBlob = await e.blob();
    assert.equal(gotBlob.size, big.size);
    // check a small tail slice
    const tail = await gotBlob.slice(gotBlob.size - 16, gotBlob.size).arrayBuffer();
    const tailArr = new Uint8Array(tail);
    // compare last few bytes to expected pattern from base
    for (let i = 0; i < tailArr.length; i++) {
      const expected = ((base[(base.length - (16 - i)) % base.length]) & 0xff);
      assert.equal(tailArr[i], expected);
    }
  });
});

describe('zipup attributes', function() {
  it('preserves DOS attributes when platform=windows', async() => {
    const z = new Zip({ platform: 'windows' });
    const attr = DosAttributes.READ_ONLY | DosAttributes.ARCHIVE;
    await z.addFile({ name: 'dos.txt', attributes: attr }, 'v');
    const blob = await z.finalize();
    const out = await unzip(blob);
    const e = out.entries['dos.txt'];
    assert.ok(e);
    // externalFileAttributes low byte should equal DOS attributes
    assert.equal(e.externalFileAttributes & 0xff, attr);
  });

  it('preserves UNIX permissions when platform=linux', async() => {
    const z = new Zip({ platform: 'linux' });
    const perm = UnixPermissions.FILE_644;
    await z.addFile({ name: 'ux.txt', attributes: perm }, 'v');
    const blob = await z.finalize();
    const out = await unzip(blob);
    const e = out.entries['ux.txt'];
    assert.ok(e);
    // unix mode should be in high 16 bits
    assert.equal((e.externalFileAttributes >>> 16) & 0xffff, perm);
  });
});

describe('zipup folder attributes', function() {
  it('preserves DOS attributes on folder when platform=windows', async() => {
    const z = new Zip({ platform: 'windows' });
    const attr = DosAttributes.HIDDEN | DosAttributes.DIRECTORY;
    // add explicit folder entry with attributes
    z.addFolder({ name: 'hidden-dir/', attributes: attr });
    const blob = await z.finalize();
    const out = await unzip(blob);
    const e = out.entries['hidden-dir/'];
    assert.ok(e);
    assert.equal(e.externalFileAttributes & 0xff, attr);
  });

  it('preserves UNIX permissions on folder when platform=linux', async() => {
    const z = new Zip({ platform: 'linux' });
    const perm = UnixPermissions.FILE_755;
    // add folder via ZipFolder API with attributes
    const root = z.addFolder('a');
    root.addFolder({ name: 'b', attributes: perm });
    const blob = await z.finalize();
    const out = await unzip(blob);
    const e = out.entries['a/b/'];
    assert.ok(e);
    assert.equal((e.externalFileAttributes >>> 16) & 0xffff, perm);
  });
});
