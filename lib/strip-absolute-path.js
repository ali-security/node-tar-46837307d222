'use strict'
// unix absolute paths are also absolute on win32, so we use this for both
const win32 = require('path').win32
const isAbsolute = win32.isAbsolute
const parse = win32.parse

// Note: lib/unpack.js deliberately keeps its own variant of this, which loops
// on the *parsed* root rather than isAbsolute(), because a windows
// drive-relative path like 'c:..\foo\bar' is not absolute but does have a
// root of 'c:' that has to come off before the '..' check.

// returns [root, stripped]
// Note that drive-specific relative paths like 'c:../foo' are not absolute,
// but do have a root that must come off, so this loops on the *parsed* root
// as well as isAbsolute(): 'c:../foo' => ['c:', '../foo'].
module.exports = path => {
  let r = ''
  let parsed = parse(path)
  while (isAbsolute(path) || parsed.root) {
    // windows will think that //x/y/z has a "root" of //x/y/
    // but strip the //?/C:/ off of //?/C:/path
    const root = path.charAt(0) === '/' && path.slice(0, 4) !== '//?/'
      ? '/' : parsed.root
    path = path.substr(root.length)
    r += root
    parsed = parse(path)
  }
  return [r, path]
}
