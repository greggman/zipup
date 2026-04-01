import {Zip, ZipFolder} from '@greggman/zipup';
import * as chai from 'chai';

interface TestPromiseInfo {
  resolve(failures: number): void; 
};

declare global {
  interface Window {
    testsPromiseInfo: TestPromiseInfo;
  }
}

const assert: Chai.Assert = chai.assert;

describe('typescript', () => {

  function addEntries(z: Zip | ZipFolder) {
    z.addFile('abc1.txt', 'hello world');
    z.addFile('abc2.bin', new Uint8Array([1, 2, 3]));
    z.addFile('abc3.txt', new Blob(['hello world'], {type: 'text/plain'})); 
    z.addFile('abc4.txt', new ArrayBuffer(8));
    z.addFile('abc5.txt', new Float32Array(8));
    z.addFile({
      name: 'abc6.txt',
      lastModDate: new Date(),
      comment: 'this is a comment',
      attributes: 0o644,
    }, new Float32Array(8));
  }

  it('compiles in typescript', async () => {
    const zip = new Zip({platform: 'unix'});
    addEntries(zip);

    const folder = zip.addFolder('folder');
    addEntries(folder);

    const blob = await zip.finalize('this is a comment');
    assert.instanceOf(blob, Blob);
  });
});

const settings = Object.fromEntries(new URLSearchParams(window.location.search).entries());
if (settings.reporter) {
  mocha.reporter(settings.reporter);
}
mocha.run((failures) => {
  window.testsPromiseInfo.resolve(failures);
});
