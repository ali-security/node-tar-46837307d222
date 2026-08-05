'use strict'
const t = require('tap')
const list = require('../lib/list.js')
const path = require('path')
const fs = require('fs')
const mutateFS = require('mutate-fs')

t.test('basic', t => {
  const file = path.resolve(__dirname, 'fixtures/tars/long-paths.tar')
  const expect = require('./fixtures/parse/long-paths.json').filter(
    e => Array.isArray(e) && e[0] === 'entry'
  ).map(e => e[1].path)

  const check = (actual, t) => {
    t.same(actual, expect)
    return Promise.resolve(null)
  }

  ;[1000, null].forEach(maxReadSize => {
    t.test('file maxReadSize=' + maxReadSize, t => {
      t.test('sync', t => {
        const actual = []
        const onentry = entry => actual.push(entry.path)
        list({
          file: file,
          sync: true,
          onentry: onentry,
          maxReadSize: maxReadSize
        })
        return check(actual, t)
      })

      t.test('async promise', t => {
        const actual = []
        const onentry = entry => actual.push(entry.path)
        return list({
          file: file,
          onentry: onentry,
          maxReadSize: maxReadSize
        }).then(_ => check(actual, t))
      })

      t.test('async cb', t => {
        const actual = []
        const onentry = entry => actual.push(entry.path)
        list({
          file: file,
          onentry: onentry,
          maxReadSize: maxReadSize
        }, er => {
          if (er)
            throw er
          check(actual, t)
          t.end()
        })
      })
      t.end()
    })
  })

  t.test('stream', t => {
    t.test('sync', t => {
      const actual = []
      const onentry = entry => actual.push(entry.path)
      const l = list({ sync: true, onentry: onentry })
      l.end(fs.readFileSync(file))
      return check(actual, t)
    })

    t.test('async', t => {
      const actual = []
      const onentry = entry => actual.push(entry.path)
      const l = list()
      l.on('entry', onentry)
      l.on('end', _ => check(actual, t).then(_ => t.end()))
      fs.createReadStream(file).pipe(l)
    })
    t.end()
  })

  t.test('no onentry function', t => list({ file: file }))

  t.test('limit to specific files', t => {
    const fileList = [
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t',
      '170-byte-filename-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc///'
    ]

    const expect = [
      '170-byte-filename-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t/',
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/',
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/a.txt',
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/Ω.txt'
    ]

    t.test('no filter function', t => {
      const check = _ => t.same(actual, expect)
      const actual = []
      return list({
        file: file,
        onentry: entry => actual.push(entry.path)
      }, fileList).then(check)
    })

    t.test('no filter function, stream', t => {
      const check = _ => t.same(actual, expect)
      const actual = []
      const onentry = entry => actual.push(entry.path)
      fs.createReadStream(file).pipe(list(fileList)
        .on('entry', onentry)
        .on('end', _ => {
          check()
          t.end()
        }))
    })

    t.test('filter function', t => {
      const check = _ => t.same(actual, expect.slice(0, 1))
      const actual = []
      return list({
        file: file,
        filter: path => path === expect[0],
        onentry: entry => actual.push(entry.path)
      }, fileList).then(check)
    })

    return t.test('list is unmunged', t => {
      t.same(fileList, [
        'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t',
        '170-byte-filename-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc///'
      ])
      t.end()
    })
  })

  t.end()
})

t.test('bad args', t => {
  t.throws(_ => list({ file: __filename, sync: true }, _ => _),
           new TypeError('callback not supported for sync tar functions'))
  t.throws(_ => list(_=>_),
           new TypeError('callback only supported with file option'))
  t.end()
})

t.test('stat fails', t => {
  const poop = new Error('poop')
  t.teardown(mutateFS.statFail(poop))
  t.test('sync', t => {
    t.plan(1)
    t.throws(_ => list({ file: __filename, sync: true }), poop)
  })
  t.test('cb', t => {
    t.plan(1)
    list({ file: __filename }, er => t.equal(er, poop))
  })
  t.test('promise', t => {
    t.plan(1)
    list({ file: __filename }).catch(er => t.equal(er, poop))
  })
  t.end()
})

t.test('read fail', t => {
  t.test('sync', t => {
    const poop = new Error('poop')
    t.teardown(mutateFS.fail('read', poop))
    t.plan(1)
    t.throws(_ => list({
      file: __filename,
      sync: true,
      maxReadSize: 10
    }), poop)
  })
  t.test('cb', t => {
    const poop = new Error('poop')
    t.teardown(mutateFS.fail('read', poop))
    t.plan(1)
    list({ file: __filename }, er => t.equal(er, poop))
  })
  t.test('promise', t => {
    const poop = new Error('poop')
    t.teardown(mutateFS.fail('read', poop))
    t.plan(1)
    list({ file: __filename }).catch(er => t.equal(er, poop))
  })
  t.end()
})

// GHSA-r292-9mhp-454m: the recursion inside filesFilter()'s mapHas() must be
// bounded.  Given a files list, mapHas() walks a candidate entry's path up to
// the root one path.dirname() at a time, recursing once per path segment, so a
// crafted archive entry with a very deeply nested path crashes the process with
// an uncatchable stack overflow.
t.test('GHSA-r292-9mhp-454m deep path does not overflow stack', t => {
  const makeTar = require('./make-tar.js')

  // test/make-tar.js encodes the path through Header.encode(), which splits it
  // across the 155-byte prefix and 100-byte path fields and truncates whatever
  // does not fit, so an archived path cannot carry more than ~255 bytes.  The
  // archived entry below stays inside that budget (and the first subtest proves
  // it survives intact); the recursion bound itself is exercised through the
  // installed filter directly, in the last subtest.
  const segments = []
  for (let i = 0; i < 40; i++)
    segments.push('x' + i)
  const deepPath = segments.join('/')
  const data = makeTar([
    { path: deepPath, type: 'File', size: 0 },
    '',
    ''
  ])

  t.test('archived deep path survives makeTar intact', t => {
    const listed = []
    const p = list({ onentry: e => listed.push(e.path) })
    p.on('error', er => { throw er })
    p.on('end', _ => {
      t.same(listed, [ deepPath ], 'fixture really is deeply nested')
      t.end()
    })
    p.end(data)
  })

  t.test('unmatched deep path is filtered out', t => {
    const listed = []
    // A files list that does NOT include deepPath is what triggers mapHas() to
    // walk all the way up to the root, one dirname() at a time.
    const p = list(
      { onentry: e => listed.push(e.path) },
      [ 'some/other/path' ]
    )
    p.on('error', er => { throw er })
    p.on('end', _ => {
      t.equal(listed.length, 0, 'no entries listed for unmatched deep path')
      t.end()
    })
    p.end(data)
  })

  // filesFilter() installs the mapHas() closure as opt.filter, and Parser keeps
  // it as this.filter, so the bound can be driven with a path far deeper than
  // any tar header is able to carry.  Unbounded, this dies with
  // 'RangeError: Maximum call stack size exceeded'.
  t.test('depth bound stops runaway recursion', t => {
    const deeper = []
    for (let i = 0; i < 20000; i++)
      deeper.push('y' + i)
    const veryDeepPath = deeper.join('/')

    const p = list({}, [ 'some/other/path' ])
    t.equal(typeof p.filter, 'function', 'files list installed a filter')

    let threw = null
    let result = null
    try {
      result = p.filter(veryDeepPath, {})
    } catch (er) {
      threw = er
    }
    t.equal(threw, null, 'no stack overflow walking a 20000-segment path')
    t.equal(result, false, 'unmatched deep path is filtered out')
    t.end()
  })

  t.end()
})

t.test('noResume option', t => {
  const file = path.resolve(__dirname, 'fixtures/tars/file.tar')
  t.test('sync', t => {
    let e
    list({
      file: file,
      onentry: entry => {
        e = entry
        process.nextTick(_ => {
          t.notOk(entry.flowing)
          entry.resume()
        })
      },
      sync: true,
      noResume: true
    })
    t.ok(e)
    t.notOk(e.flowing)
    e.on('end', _ => t.end())
  })

  t.test('async', t => {
    let e
    return list({
      file: file,
      onentry: entry => {
        process.nextTick(_ => {
          t.notOk(entry.flowing)
          entry.resume()
        })
      },
      noResume: true
    })
  })

  t.end()
})
