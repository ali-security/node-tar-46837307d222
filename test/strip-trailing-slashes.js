'use strict'

const t = require('tap')
const stripSlash = require('../lib/strip-trailing-slashes.js')

// [ input, expected ] pairs.  Written as an array of pairs rather than an
// object + Object.entries()/destructuring, since this package supports
// node 4, where neither of those is available.
const cases = [
  ['/', ''],
  ['////', ''],
  ['c:///a/b/c', 'c:///a/b/c'],
  ['\\\\foo\\bar\\baz', '\\\\foo\\bar\\baz'],
  ['//foo//bar//baz', '//foo//bar//baz'],
  ['c:\\c:\\c:\\c:\\\\d:\\e/f/g', 'c:\\c:\\c:\\c:\\\\d:\\e/f/g'],
  ['a/b/c/', 'a/b/c'],
  ['a/b/c///////', 'a/b/c'],
]

for (let i = 0; i < cases.length; i++) {
  const c = cases[i]
  t.strictSame(stripSlash(c[0]), c[1], JSON.stringify(c[0]))
}

// exercise the batched slash-stripping on a pathologically long run of
// trailing slashes, which is why the batchStrings table exists at all.
const short = '///a///b///c///'
const long = short.repeat(10) + '/'.repeat(1000000)
t.equal(stripSlash(short), '///a///b///c')
t.equal(stripSlash(long), short.repeat(9) + '///a///b///c')
