# zipup.js

<img src="./zipup-no-anim.png" style="max-width: 640px">

Simple modern, small, zero dependency zip library for browser and node based JavaScript

[![Build and Deploy](https://github.com/greggman/zipup/actions/workflows/build_and_deploy.yml/badge.svg)](https://github.com/greggman/zipup/actions/workflows/build_and_deploy.yml)
[[Live Tests](https://greggman.github.io/zipup/test/)]

Most data is stored in blob so *theoretically* the browser or node can virtualize
the storage.

# Example Usage:

```js
import { Zip } from '@greggman/zipup';

const zip = new Zip();
zip.addFile('foo.txt', someString);
zip.addFile('bar.png', someArrayBuffer);
zip.addFile('folder/moo.mp4', someArrayBufferView);
zip.addFile('folder/stuff.bin', someBlob);
const blob = await zip.finalize(comment?: string);
```

after which you could offer it to the user to download

```js
const saveBlob = (function() {
  const a = document.createElement('a');
  document.body.appendChild(a);
  a.style.display = 'none';
  return function saveData(blob, fileName) {
    const url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName;
    a.click();
  };
}());

saveBlob(blob, 'your-data.zip');
```

# API

```js
class Zip {
  constructor(options: { platform?: Platform });
  async addFile(pathOrInfo: string | EntryInfo, string | ArrayBuffer | ArrayBufferView | Blob): Promise<void>;
  addFolder(pathOrInfo: string | EntryInfo): ZipFolder;
  async finalize(comment?: string): Promise<Blob>;
};

class EntryInfo {
  name: string,                     // name of entry
  comment: string,                  // the comment for this entry
  lastModDate: Date,                // a Date
  attributes: number,               // platform specific attributes
};

class ZipFolder {
  async addFile(meta: string | EntryInfo, string | ArrayBuffer | ArrayBufferView | Blob): Promise<void>;
  addFolder(meta: string | EntryInfo): ZipFolder;  
};

type Platform = 'windows' | 'linux' | 'macos' | 'unix';
```

As you can see above you can pass either just a path, or an object with more meta data

```js
zip.addFile('hello.txt', someString);
zip.addFile({
  name: 'readme.txt',
  comment?: 'the readme file',
  lastModData?: new Date(),  // or any date
}, content)
```

`addFile` is asynchronous. You do not have to wait as `finalize` will
automatically wait but `addFile` does return a promise if you want to throttle
(🤷‍♂️).

You can add a file to a folder either by including it in the name

```js
zip.addFile('folder/file.bin', ...);
```

or by creating a folder

```js
const folder = zip.addFolder('folder');
folder.addFile('file.bin');
```

# Why?

Most of the other libraries are old and crufty. The browser itself now supports
compression and so does node.js so why not just use those. Example: JSZip is 97k
minified, 28k gzipped. zipup is 8k minified, 3k (gzipped). Yes, that's not a
completely fair comparison. zipup has the functionality I need. I don't need the
other stuff. Nor do I need 13 dependencies.

Note: the library uses [`CompressionStream`](https://caniuse.com/?search=compressionstream).
Use a [polyfill](https://github.com/101arrowz/compression-streams-polyfill) if you're supporting
old stuff.

# Unzip

Use [unzipit](https://greggman.github.io/unzipit).

# Attributes

AFAICT it's not common to use attributes in zip files. Attributes in zip files
are platform specific and to be honest, I have no idea what all the various
tools do as there are too many. Effectively, if you want to set permissions you
should choose a platform when you create the zip file and then use the
appropriate permissions.

```js
import {Zip, DosAttributes, UnixPermissions} from 'zipup';

const dosZip = new Zip({platform: 'windows'});
dosZip.addFile({
  name: 'foo.txt',
  attributes: DosAttributes.READ_ONLY,
});
const dosBlob = await dosZip.finalize();

const unixZip = new Zip({platform: 'unix'});
unixZip.addFile({
  name: 'foo.txt',
  attributes: UnixPermissions.FILE_755, // or 0o755
});
const unixZip = await dosZip.finalize();
```

# Testing

Use `npm test` to run the tests from the command line.

## Live Browser Tests

[https://greggman.github.io/zipup/test/](https://greggman.github.io/zipup/test/)

# License

MIT
