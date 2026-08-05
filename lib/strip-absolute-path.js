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
module.exports = path => {
  let r = ''
  while (isAbsolute(path)) {
    // windows will think that //x/y/z has a "root" of //x/y/
    const root = path.charAt(0) === '/' ? '/' : parse(path).root
    path = path.substr(root.length)
    r += root
  }
  return [r, path]
}
