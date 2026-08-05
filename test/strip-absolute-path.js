'use strict'
const t = require('tap')
const stripAbsolutePath = require('../lib/strip-absolute-path.js')

// [ input, [ root, stripped ] ]
const cases = [
  ['/', ['/', '']],
  ['////', ['////', '']],
  ['c:///a/b/c', ['c:///', 'a/b/c']],
  ['\\\\foo\\bar\\baz', ['\\\\foo\\bar\\', 'baz']],
  ['//foo//bar//baz', ['//', 'foo//bar//baz']],
  ['c:\\c:\\c:\\c:\\\\d:\\e/f/g', ['c:\\c:\\c:\\c:\\\\d:\\', 'e/f/g']]
]

for (let i = 0; i < cases.length; i++) {
  const input = cases[i][0]
  const expect = cases[i][1]
  t.strictSame(stripAbsolutePath(input), expect, input)
}
