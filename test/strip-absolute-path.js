'use strict'
const t = require('tap')
const stripAbsolutePath = require('../lib/strip-absolute-path.js')

const cwd = process.cwd()
const requireInject = require('./utils/require-inject.js')

// [ input, [ root, stripped ] ]

t.test('basic', t => {
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
    t.strictSame(stripAbsolutePath(input, cwd), expect, input)
  }
  t.end()
})

t.test('drive-local paths', t => {
  const env = process.env
  t.teardown(function () { process.env = env })
  const cwd = 'D:\\safety\\land'
  const realPath = require('path')
  // be windowsy.  Object.assign rather than object spread -- node 4/6 in
  // the support matrix cannot parse `{ ...realPath.win32 }`.
  const path = Object.assign({}, realPath.win32, {
    win32: realPath.win32,
    posix: realPath.posix
  })
  const stripAbsolutePath = requireInject('../lib/strip-absolute-path.js', {
    path: path
  })
  const cases = [
    ['/', ['/', '']],
    ['////', ['////', '']],
    ['c:///a/b/c', ['c:///', 'a/b/c']],
    ['\\\\foo\\bar\\baz', ['\\\\foo\\bar\\', 'baz']],
    ['//foo//bar//baz', ['//', 'foo//bar//baz']],
    ['c:\\c:\\c:\\c:\\\\d:\\e/f/g', ['c:\\c:\\c:\\c:\\\\d:\\', 'e/f/g']],
    ['c:..\\system\\explorer.exe', ['c:', '..\\system\\explorer.exe']],
    ['d:..\\..\\unsafe\\land', ['d:', '..\\..\\unsafe\\land']],
    ['c:foo', ['c:', 'foo']],
    ['D:mark', ['D:', 'mark']],
    ['//?/X:/y/z', ['//?/X:/', 'y/z']],
    ['\\\\?\\X:\\y\\z', ['\\\\?\\X:\\', 'y\\z']]
  ]
  for (let i = 0; i < cases.length; i++) {
    const input = cases[i][0]
    const expect = cases[i][1]
    if (!t.strictSame(stripAbsolutePath(input, cwd), expect, input))
      break
  }
  t.end()
})
