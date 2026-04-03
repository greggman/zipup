/* zipup@0.0.2, license MIT */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.zipup = {}));
})(this, (function (exports) { 'use strict';

  // Minimal ZIP packer. Tries to compress using CompressionStream('deflate-raw') when available,
  // falls back to store (no compression). Returns a Blob of the ZIP archive.
  exports.DosAttributes = void 0;
  (function (DosAttributes) {
      DosAttributes[DosAttributes["READ_ONLY"] = 1] = "READ_ONLY";
      DosAttributes[DosAttributes["HIDDEN"] = 2] = "HIDDEN";
      DosAttributes[DosAttributes["SYSTEM"] = 4] = "SYSTEM";
      DosAttributes[DosAttributes["VOLUME_LABEL"] = 8] = "VOLUME_LABEL";
      DosAttributes[DosAttributes["DIRECTORY"] = 16] = "DIRECTORY";
      DosAttributes[DosAttributes["ARCHIVE"] = 32] = "ARCHIVE";
  })(exports.DosAttributes || (exports.DosAttributes = {}));
  exports.UnixPermissions = void 0;
  (function (UnixPermissions) {
      UnixPermissions[UnixPermissions["S_IRUSR"] = 256] = "S_IRUSR";
      UnixPermissions[UnixPermissions["S_IWUSR"] = 128] = "S_IWUSR";
      UnixPermissions[UnixPermissions["S_IXUSR"] = 64] = "S_IXUSR";
      UnixPermissions[UnixPermissions["S_IRGRP"] = 32] = "S_IRGRP";
      UnixPermissions[UnixPermissions["S_IWGRP"] = 16] = "S_IWGRP";
      UnixPermissions[UnixPermissions["S_IXGRP"] = 8] = "S_IXGRP";
      UnixPermissions[UnixPermissions["S_IROTH"] = 4] = "S_IROTH";
      UnixPermissions[UnixPermissions["S_IWOTH"] = 2] = "S_IWOTH";
      UnixPermissions[UnixPermissions["S_IXOTH"] = 1] = "S_IXOTH";
      UnixPermissions[UnixPermissions["FILE_644"] = 420] = "FILE_644";
      UnixPermissions[UnixPermissions["FILE_755"] = 493] = "FILE_755";
  })(exports.UnixPermissions || (exports.UnixPermissions = {}));
  const crc32 = (() => {
      let table;
      function makeTable() {
          table = new Array(256);
          for (let i = 0; i < 256; i++) {
              let c = i;
              for (let k = 0; k < 8; k++) {
                  c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
              }
              table[i] = c >>> 0;
          }
      }
      function update(crc, buf) {
          if (!table) {
              makeTable();
          }
          let v = crc;
          const t = table;
          for (let i = 0; i < buf.length; i++) {
              v = (v >>> 8) ^ t[(v ^ buf[i]) & 0xff];
          }
          return v >>> 0;
      }
      function finish(crc) {
          return (crc ^ -1) >>> 0;
      }
      function of(buf) {
          let crc = 0 ^ -1;
          crc = update(crc, buf);
          return finish(crc);
      }
      const fn = of;
      fn.update = update;
      fn.init = function () {
          return 0 ^ -1;
      };
      fn.finish = finish;
      return fn;
  })();
  function writeU16(buf, offset, n) {
      buf[offset] = n & 0xff;
      buf[offset + 1] = (n >>> 8) & 0xff;
      return offset + 2;
  }
  function writeU32(buf, offset, n) {
      buf[offset] = n & 0xff;
      buf[offset + 1] = (n >>> 8) & 0xff;
      buf[offset + 2] = (n >>> 16) & 0xff;
      buf[offset + 3] = (n >>> 24) & 0xff;
      return offset + 4;
  }
  function writeU64(buf, offset, n) {
      // write little-endian 64-bit using two 32-bit writes
      const lo = n >>> 0;
      const hi = Math.floor(n / 0x100000000) >>> 0;
      buf[offset] = lo & 0xff;
      buf[offset + 1] = (lo >>> 8) & 0xff;
      buf[offset + 2] = (lo >>> 16) & 0xff;
      buf[offset + 3] = (lo >>> 24) & 0xff;
      buf[offset + 4] = hi & 0xff;
      buf[offset + 5] = (hi >>> 8) & 0xff;
      buf[offset + 6] = (hi >>> 16) & 0xff;
      buf[offset + 7] = (hi >>> 24) & 0xff;
      return offset + 8;
  }
  function writeBytes(buf, offset, bytes) {
      buf.set(bytes, offset);
      return offset + bytes.length;
  }
  function dateToDosTime(d) {
      const sec = Math.floor(d.getSeconds() / 2);
      const min = d.getMinutes();
      const hrs = d.getHours();
      return (hrs << 11) | (min << 5) | sec;
  }
  function dateToDosDate(d) {
      const day = d.getDate();
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      const y = Math.max(0, Math.min(year - 1980, 0x7f));
      return (y << 9) | (month << 5) | day;
  }
  /* blobToUint8 removed — Blob processing done in-place to avoid loading whole blob into memory */
  async function tryCompress(input) {
      try {
          const cs = new CompressionStream('deflate-raw');
          // construct an ArrayBuffer containing only the Uint8Array's bytes
          const arr = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
          const rs = new Response(new Blob([arr])).body.pipeThrough(cs);
          const chunks = [];
          const reader = rs.getReader();
          let total = 0;
          while (true) {
              const { done, value } = await reader.read();
              if (done) {
                  break;
              }
              const v = new Uint8Array(value);
              chunks.push(v);
              total += v.length;
          }
          const out = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) {
              out.set(c, offset);
              offset += c.length;
          }
          return out;
      }
      catch (_e) {
          // compression failed, fall back
      }
      return null;
  }
  const driveLetterRegex = /^[a-zA-Z]:/;
  function sanitizePath(path) {
      // ZIP format specifies that paths should use forward slashes, even on Windows
      path = path.replace(/\\/g, '/');
      // strip control characters (including NUL)
      path = path.replace(/[\x00-\x1F\x7F]/g, '');
      const parts = path.split('/');
      const newParts = [];
      for (const part of parts) {
          let p = part;
          // remove trailing dots/spaces from each path component (Windows compatibility)
          p = p.replace(/[. ]+$/g, '');
          if (p === '' || p === '.') {
              // skip empty parts and current dir references
              continue;
          }
          else if (part === '..') {
              // remove previous part for parent dir reference, but don't allow going above root
              if (newParts.length > 0) {
                  newParts.pop();
              }
          }
          else {
              // disallow problematic characters that are bad for filesystems/ZIP
              if (/[<>"\\|?*]/.test(p) || p.indexOf(':') !== -1) {
                  throw new Error(`Invalid path, contains invalid characters: ${path}`);
              }
              // disallow reserved Windows device names (CON, PRN, AUX, NUL, COM1..COM9, LPT1..LPT9)
              if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(p)) {
                  throw new Error(`Invalid path, has windows device name: ${path}`);
              }
              newParts.push(p);
          }
      }
      const newPath = newParts.join('/');
      if (driveLetterRegex.test(newPath)) {
          throw new Error(`Invalid path, has drive letter: ${path}`);
      }
      return newPath;
  }
  class ZipFolder {
      #name;
      #zip;
      constructor(zip, name) {
          this.#name = name;
          this.#zip = zip;
      }
      addFile(pathOrInfo, data) {
          return this.#zip.addFile(this.#makeMeta(pathOrInfo), data);
      }
      addFolder(pathOrInfo) {
          return this.#zip.addFolder(this.#makeMeta(pathOrInfo));
      }
      #makeMeta(meta) {
          if (typeof meta === 'string') {
              return { name: `${this.#name}/${meta}` };
          }
          else {
              return {
                  ...meta,
                  name: `${this.#name}/${meta.name}`,
              };
          }
      }
  }
  class Zip {
      #parts = [];
      #entries = [];
      #offset = 0;
      #pending = [];
      #finalized = false;
      #platform = 'windows';
      constructor(options) {
          if (options && options.platform) {
              this.#platform = options.platform;
          }
      }
      async addFile(pathOrInfo, data) {
          this.#checkFinalized();
          const name = sanitizePath(typeof pathOrInfo === 'string' ? pathOrInfo : pathOrInfo.name);
          const p = (async () => {
              const nameBytes = new TextEncoder().encode(name);
              let crc;
              let inputLength;
              let compressedBlob;
              let method = 8;
              if (typeof data === 'string') {
                  const input = new TextEncoder().encode(data);
                  crc = crc32(input);
                  const compressed = await tryCompress(input);
                  const compToUse = (!compressed || compressed.length >= input.length) ? input : compressed;
                  if (compToUse === input) {
                      method = 0;
                  }
                  compressedBlob = new Blob([compToUse]);
                  inputLength = input.length;
              }
              else if (data instanceof Blob) {
                  // process blob in chunks to avoid reading whole blob into memory
                  const CHUNK = 16 * 1024 * 1024; // 16MB
                  let pos = 0;
                  let crcVal = crc32.init();
                  let total = 0;
                  // first pass: compute crc and total size without holding all data
                  for (pos = 0; pos < data.size; pos += CHUNK) {
                      const slice = data.slice(pos, pos + CHUNK);
                      const arr = new Uint8Array(await slice.arrayBuffer());
                      crcVal = crc32.update(crcVal, arr);
                      total += arr.length;
                  }
                  crc = crc32.finish(crcVal);
                  inputLength = total;
                  // stream-compress the blob into a Blob using CompressionStream
                  try {
                      const rs = new ReadableStream({
                          async start(controller) {
                              for (let p2 = 0; p2 < data.size; p2 += CHUNK) {
                                  const s = data.slice(p2, p2 + CHUNK);
                                  const a = new Uint8Array(await s.arrayBuffer());
                                  controller.enqueue(a);
                              }
                              controller.close();
                          },
                      });
                      const cs = new CompressionStream('deflate-raw');
                      const compressedStream = rs.pipeThrough(cs);
                      compressedBlob = await new Response(compressedStream).blob();
                      // if compression didn't help, store original blob
                      if (compressedBlob.size >= inputLength) {
                          compressedBlob = data;
                          method = 0;
                      }
                      else {
                          method = 8;
                      }
                  }
                  catch (_e) {
                      compressedBlob = data;
                      method = 0;
                  }
              }
              else if (data instanceof ArrayBuffer) {
                  const input = new Uint8Array(data);
                  crc = crc32(input);
                  const compressed = await tryCompress(input);
                  const compToUse = (!compressed || compressed.length >= input.length) ? input : compressed;
                  if (compToUse === input) {
                      method = 0;
                  }
                  compressedBlob = new Blob([compToUse]);
                  inputLength = input.length;
              }
              else {
                  const view = data;
                  const input = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
                  crc = crc32(input);
                  const compressed = await tryCompress(input);
                  const compToUse = (!compressed || compressed.length >= input.length) ? input : compressed;
                  if (compToUse === input) {
                      method = 0;
                  }
                  compressedBlob = new Blob([compToUse]);
                  inputLength = input.length;
              }
              // local file header
              // Writes the per-file local header immediately before the file data.
              // Fields written here (in order):
              //  - local file header signature (0x04034b50)
              //  - version needed to extract
              //  - general purpose bit flag
              //  - compression method
              //  - last mod time / date (placeholder zeros here)
              //  - CRC-32 of the uncompressed data
              //  - compressed size
              //  - uncompressed size
              //  - file name length and extra field length, followed by the file name
              const needsZip64Local = inputLength > 0xffffffff || compressedBlob.size > 0xffffffff;
              let localExtra;
              if (needsZip64Local) {
                  // local header ZIP64 extra field: id 0x0001, data size 16 (8 + 8)
                  localExtra = new Uint8Array(4 + 16);
                  let ee = 0;
                  ee = writeU16(localExtra, ee, 0x0001);
                  ee = writeU16(localExtra, ee, 16);
                  ee = writeU64(localExtra, ee, inputLength);
                  ee = writeU64(localExtra, ee, compressedBlob.size);
              }
              const localExtraLen = localExtra ? localExtra.length : 0;
              const localHeader = new Uint8Array(30 + nameBytes.length + localExtraLen);
              let q = 0;
              q = writeU32(localHeader, q, 0x04034b50);
              localHeader[q++] = 20;
              localHeader[q++] = 0;
              // general purpose bit flag: set UTF-8 (EFS) bit (0x0800) so names are marked as UTF-8
              const gpFlagLocal = 0x0800;
              localHeader[q++] = gpFlagLocal & 0xff;
              localHeader[q++] = (gpFlagLocal >>> 8) & 0xff;
              localHeader[q++] = method & 0xff;
              localHeader[q++] = (method >>> 8) & 0xff;
              localHeader[q++] = 0;
              localHeader[q++] = 0;
              localHeader[q++] = 0;
              localHeader[q++] = 0;
              q = writeU32(localHeader, q, crc);
              // compressed / uncompressed size fields: if zip64 local, set to 0xFFFFFFFF and put real values in extra
              q = writeU32(localHeader, q, needsZip64Local ? 0xffffffff : compressedBlob.size);
              q = writeU32(localHeader, q, needsZip64Local ? 0xffffffff : inputLength);
              q = writeU16(localHeader, q, nameBytes.length);
              q = writeU16(localHeader, q, localExtraLen);
              q = writeBytes(localHeader, q, nameBytes);
              if (localExtra) {
                  q = writeBytes(localHeader, q, localExtra);
              }
              const localOffset = this.#offset;
              this.#parts.push(localHeader);
              this.#parts.push(compressedBlob);
              // store metadata for central directory construction in finalize
              const entryMeta = {
                  nameBytes,
                  crc,
                  compressedBlob,
                  inputLength,
                  method,
                  offset: localOffset,
              };
              // optional comment and lastModDate from meta param
              if (typeof pathOrInfo !== 'string') {
                  if (pathOrInfo.comment) {
                      entryMeta.commentBytes = new TextEncoder().encode(pathOrInfo.comment);
                  }
                  if (pathOrInfo.lastModDate) {
                      entryMeta.lastModDate = pathOrInfo.lastModDate;
                  }
                  else {
                      entryMeta.lastModDate = new Date();
                  }
                  if (typeof pathOrInfo.attributes === 'number') {
                      entryMeta.attributes = pathOrInfo.attributes;
                  }
              }
              else {
                  entryMeta.lastModDate = new Date();
              }
              this.#entries.push(entryMeta);
              this.#offset += localHeader.length + compressedBlob.size;
          })();
          this.#pending.push(p);
          return p;
      }
      addFolder(name) {
          let folderName = sanitizePath(typeof name === 'string' ? name : name.name);
          if (!folderName.endsWith('/')) {
              folderName += '/';
          }
          this.#checkFinalized();
          const nameBytes = new TextEncoder().encode(folderName);
          // local file header for directory entry (no data)
          const localHeader = new Uint8Array(30 + nameBytes.length);
          let q = 0;
          q = writeU32(localHeader, q, 0x04034b50);
          localHeader[q++] = 20;
          localHeader[q++] = 0;
          // general purpose bit flag: UTF-8
          const gpFlagLocal = 0x0800;
          localHeader[q++] = gpFlagLocal & 0xff;
          localHeader[q++] = (gpFlagLocal >>> 8) & 0xff;
          // method = 0 (stored)
          localHeader[q++] = 0;
          localHeader[q++] = 0;
          // last mod time / date placeholders (zeros)
          localHeader[q++] = 0;
          localHeader[q++] = 0;
          localHeader[q++] = 0;
          localHeader[q++] = 0;
          // crc, compressed size, uncompressed size = 0
          q = writeU32(localHeader, q, 0);
          q = writeU32(localHeader, q, 0);
          q = writeU32(localHeader, q, 0);
          q = writeU16(localHeader, q, nameBytes.length);
          q = writeU16(localHeader, q, 0);
          q = writeBytes(localHeader, q, nameBytes);
          const localOffset = this.#offset;
          this.#parts.push(localHeader);
          const entryMeta = {
              nameBytes,
              crc: 0,
              compressedBlob: new Blob([]),
              inputLength: 0,
              method: 0,
              offset: localOffset,
          };
          if (typeof name !== 'string') {
              if (name.comment) {
                  entryMeta.commentBytes = new TextEncoder().encode(name.comment);
              }
              entryMeta.lastModDate = name.lastModDate ? name.lastModDate : new Date();
              if (typeof name.attributes === 'number') {
                  entryMeta.attributes = name.attributes;
              }
              else {
                  // default directory attributes: set DOS directory bit for windows
                  if (this.#platform === 'windows') {
                      entryMeta.attributes = exports.DosAttributes.DIRECTORY;
                  }
                  else {
                      // unix: default to rwxr-xr-x (0o755) for directories
                      entryMeta.attributes = exports.UnixPermissions.FILE_755;
                  }
              }
          }
          else {
              entryMeta.lastModDate = new Date();
              if (this.#platform === 'windows') {
                  entryMeta.attributes = exports.DosAttributes.DIRECTORY;
              }
              else {
                  entryMeta.attributes = exports.UnixPermissions.FILE_755;
              }
          }
          this.#entries.push(entryMeta);
          this.#offset += localHeader.length;
          return new ZipFolder(this, folderName);
      }
      async finalize(comment) {
          this.#checkFinalized();
          this.#finalized = true;
          await Promise.all(this.#pending);
          // write central directory
          let centralSize = 0;
          const centralOffset = this.#offset;
          // determine whether ZIP64 structures are needed
          const useZip64 = this.#entries.length > 0xfffe || this.#entries.some(m => m.inputLength > 0xffffffff || m.compressedBlob.size > 0xffffffff || m.offset > 0xffffffff);
          // build central directory entries from stored metadata
          for (const meta of this.#entries) {
              const nameBytes = meta.nameBytes;
              const commentBytes = meta.commentBytes;
              const cLen = commentBytes ? commentBytes.length : 0;
              if (cLen > 0xffff) {
                  throw new RangeError(`ZIP entry comment too long: ${cLen} bytes (maximum 65535)`);
              }
              // build central directory file header for this entry
              // include ZIP64 extra field when needed
              const needsZip64 = meta.inputLength > 0xffffffff || meta.compressedBlob.size > 0xffffffff || meta.offset > 0xffffffff;
              const extraForCentral = needsZip64 ? (() => {
                  // id (2) + size (2) + 8*3 bytes = 4 + 24 = 28
                  const buf = new Uint8Array(4 + 24);
                  let r = 0;
                  r = writeU16(buf, r, 0x0001);
                  r = writeU16(buf, r, 24);
                  r = writeU64(buf, r, meta.inputLength);
                  r = writeU64(buf, r, meta.compressedBlob.size);
                  r = writeU64(buf, r, meta.offset);
                  return buf;
              })() : undefined;
              const extraLen = extraForCentral ? extraForCentral.length : 0;
              const central = new Uint8Array(46 + nameBytes.length + extraLen + cLen);
              let qq = 0;
              qq = writeU32(central, qq, 0x02014b50);
              // version made by: low byte = version (20), high byte = OS (0=MS-DOS, 3=Unix)
              const plat = this.#platform || 'windows';
              const osCode = (plat === 'macos' || plat === 'linux' || plat === 'unix') ? 3 : 0;
              const versionMadeBy = (osCode << 8) | 20;
              central[qq++] = versionMadeBy & 0xff;
              central[qq++] = (versionMadeBy >>> 8) & 0xff;
              // version needed to extract
              central[qq++] = 20;
              central[qq++] = 0;
              // general purpose bit flag in central directory: set UTF-8 (EFS) bit (0x0800)
              const gpFlagCentral = 0x0800;
              central[qq++] = gpFlagCentral & 0xff;
              central[qq++] = (gpFlagCentral >>> 8) & 0xff;
              central[qq++] = meta.method & 0xff;
              central[qq++] = (meta.method >>> 8) & 0xff;
              // last mod time/date
              const lm = meta.lastModDate instanceof Date ? meta.lastModDate : new Date(meta.lastModDate ?? Date.now());
              const dosTime = dateToDosTime(lm);
              const dosDate = dateToDosDate(lm);
              central[qq++] = dosTime & 0xff;
              central[qq++] = (dosTime >>> 8) & 0xff;
              central[qq++] = dosDate & 0xff;
              central[qq++] = (dosDate >>> 8) & 0xff;
              qq = writeU32(central, qq, meta.crc);
              // compressed / uncompressed sizes: 0xFFFFFFFF if ZIP64 needed for these fields
              qq = writeU32(central, qq, (meta.compressedBlob.size > 0xffffffff) ? 0xffffffff : meta.compressedBlob.size);
              qq = writeU32(central, qq, (meta.inputLength > 0xffffffff) ? 0xffffffff : meta.inputLength);
              qq = writeU16(central, qq, nameBytes.length);
              qq = writeU16(central, qq, extraLen); // extra field length
              qq = writeU16(central, qq, cLen); // file comment length
              qq = writeU16(central, qq, 0); // disk number start
              qq = writeU16(central, qq, 0); // internal file attrs
              // external file attributes: depend on platform and provided attributes
              let externalAttrs = 0;
              if (typeof meta.attributes === 'number') {
                  if (osCode === 3) {
                      // unix: mode goes in high 16 bits
                      externalAttrs = (meta.attributes & 0xffff) << 16;
                  }
                  else {
                      // dos/windows: attributes stored in low byte
                      externalAttrs = meta.attributes & 0xff;
                  }
              }
              else {
                  // no attributes provided: leave 0
                  externalAttrs = 0;
              }
              qq = writeU32(central, qq, externalAttrs); // external file attrs
              qq = writeU32(central, qq, (meta.offset > 0xffffffff) ? 0xffffffff : meta.offset);
              qq = writeBytes(central, qq, nameBytes);
              if (extraForCentral) {
                  qq = writeBytes(central, qq, extraForCentral);
              }
              if (commentBytes && commentBytes.length) {
                  qq = writeBytes(central, qq, commentBytes);
              }
              this.#parts.push(central);
              centralSize += central.length;
          }
          // End of central directory (EOCD) record
          // Fields written here (in order):
          //  - EOCD signature (0x06054b50)
          //  - number of this disk, number of the disk with central directory (here 0)
          //  - total entries on this disk, total entries in central directory
          //  - size of central directory (bytes)
          //  - offset of start of central directory, relative to start of archive
          //  - ZIP file comment length (will be set later if a global comment is provided)
          // If ZIP64 is needed, write ZIP64 End of Central Directory Record and Locator
          if (useZip64) {
              // ZIP64 EOCDR
              // signature + size(8) + 44 bytes of fixed fields = 56 total
              const zip64Eocdr = new Uint8Array(56);
              let p = 0;
              p = writeU32(zip64Eocdr, p, 0x06064b50);
              // size of zip64 eocdr remaining (44)
              p = writeU64(zip64Eocdr, p, 44);
              p = writeU16(zip64Eocdr, p, 45); // version made by
              p = writeU16(zip64Eocdr, p, 45); // version needed to extract
              p = writeU32(zip64Eocdr, p, 0); // this disk
              p = writeU32(zip64Eocdr, p, 0); // disk with start of central dir
              // total number of entries on this disk
              p = writeU64(zip64Eocdr, p, this.#entries.length);
              // total number of entries
              p = writeU64(zip64Eocdr, p, this.#entries.length);
              // size of central directory
              p = writeU64(zip64Eocdr, p, centralSize);
              // offset of start of central directory
              p = writeU64(zip64Eocdr, p, centralOffset);
              // ZIP64 EOCD Locator
              const zip64Eocdl = new Uint8Array(20);
              let r = 0;
              r = writeU32(zip64Eocdl, r, 0x07064b50);
              r = writeU32(zip64Eocdl, r, 0); // number of the disk with the start of the zip64 eocdr
              // relative offset of zip64 eocdr (centralOffset + centralSize)
              const zip64EocdrOffset = this.#offset + centralSize;
              r = writeU64(zip64Eocdl, r, zip64EocdrOffset);
              r = writeU32(zip64Eocdl, r, 1); // total number of disks
              this.#parts.push(zip64Eocdr);
              this.#parts.push(zip64Eocdl);
          }
          const eocd = new Uint8Array(22);
          let off = 0;
          off = writeU32(eocd, off, 0x06054b50);
          off = writeU32(eocd, off, 0); // disk numbers
          // total entries on this disk and total entries
          off = writeU16(eocd, off, useZip64 ? 0xffff : this.#entries.length);
          off = writeU16(eocd, off, useZip64 ? 0xffff : this.#entries.length);
          off = writeU32(eocd, off, useZip64 ? 0xffffffff : centralSize);
          off = writeU32(eocd, off, useZip64 ? 0xffffffff : centralOffset);
          off = writeU16(eocd, off, 0); // comment length
          this.#parts.push(eocd);
          if (comment && comment.length) {
              const commentBytes = new TextEncoder().encode(comment);
              const len = commentBytes.length;
              if (len > 0xffff) {
                  throw new RangeError(`ZIP comment too long: ${len} bytes (maximum 65535)`);
              }
              eocd[eocd.length - 2] = len & 0xff;
              eocd[eocd.length - 1] = (len >>> 8) & 0xff;
              this.#parts.push(commentBytes);
          }
          const blobParts = this.#parts.map(x => x);
          // Cleanup
          this.#parts = [];
          this.#entries = [];
          this.#pending = [];
          return new Blob(blobParts, { type: 'application/zip' });
      }
      #checkFinalized() {
          if (this.#finalized) {
              throw new Error('Zip already finalized');
          }
      }
  }

  exports.Zip = Zip;
  exports.ZipFolder = ZipFolder;

}));
