'use strict'

// this is the only approach that was significantly faster than using
// str.replace(/\/+$/, '') for strings ending with a lot of / chars and
// containing multiple / chars.
const batchStrings = [
  '/'.repeat(1024),
  '/'.repeat(512),
  '/'.repeat(256),
  '/'.repeat(128),
  '/'.repeat(64),
  '/'.repeat(32),
  '/'.repeat(16),
  '/'.repeat(8),
  '/'.repeat(4),
  '/'.repeat(2),
  '/',
]

// The 'use strict' above is load-bearing on node 4 (in the support matrix):
// in sloppy mode `const` there is the legacy function-scoped const, so a
// `for (const s of batchStrings)` head never re-binds and the loop only ever
// sees batchStrings[0], stripping nothing.  The indexed loop below does not
// depend on that at all.
module.exports = str => {
  for (let i = 0; i < batchStrings.length; i++) {
    const s = batchStrings[i]
    while (str.length >= s.length && str.slice(-1 * s.length) === s)
      str = str.slice(0, -1 * s.length)
  }
  return str
}
