'use strict'

const t = require('tap')
const x = require('../lib/extract.js')
const path = require('path')
const fs = require('fs')
const extractdir = path.resolve(__dirname, 'fixtures/extract')
const tars = path.resolve(__dirname, 'fixtures/tars')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const mutateFS = require('mutate-fs')

t.teardown(_ => rimraf.sync(extractdir))

t.test('basic extracting', t => {
  const file = path.resolve(tars, 'utf8.tar')
  const dir = path.resolve(extractdir, 'basic')

  t.beforeEach(cb => {
    rimraf.sync(dir)
    mkdirp.sync(dir)
    cb()
  })

  const check = t => {
    fs.lstatSync(dir + '/Ω.txt')
    fs.lstatSync(dir + '/🌟.txt')
    t.throws(_ => fs.lstatSync(dir + '/long-path/r/e/a/l/l/y/-/d/e/e/p/-' +
                               '/f/o/l/d/e/r/-/p/a/t/h/Ω.txt'))

    rimraf.sync(dir)
    t.end()
  }

  const files = [ '🌟.txt', 'Ω.txt' ]
  t.test('sync', t => {
    x({ file: file, sync: true, C: dir }, files)
    check(t)
  })

  t.test('async promisey', t => {
    return x({ file: file, cwd: dir }, files).then(_ => {
      check(t)
    })
  })

  t.test('async cb', t => {
    return x({ file: file, cwd: dir }, files, er => {
      if (er)
        throw er
      check(t)
    })
  })

  t.end()
})

t.test('file list and filter', t => {
  const file = path.resolve(tars, 'utf8.tar')
  const dir = path.resolve(extractdir, 'filter')

  t.beforeEach(cb => {
    rimraf.sync(dir)
    mkdirp.sync(dir)
    cb()
  })

  const check = t => {
    fs.lstatSync(dir + '/Ω.txt')
    t.throws(_ => fs.lstatSync(dir + '/🌟.txt'))
    t.throws(_ => fs.lstatSync(dir + '/long-path/r/e/a/l/l/y/-/d/e/e/p/-' +
                               '/f/o/l/d/e/r/-/p/a/t/h/Ω.txt'))

    rimraf.sync(dir)
    t.end()
  }

  const filter = path => path === 'Ω.txt'

  t.test('sync', t => {
    x({ filter: filter, file: file, sync: true, C: dir }, [ '🌟.txt', 'Ω.txt' ])
    check(t)
  })

  t.test('async promisey', t => {
    return x({ filter: filter, file: file, cwd: dir }, [ '🌟.txt', 'Ω.txt' ]).then(_ => {
      check(t)
    })
  })

  t.test('async cb', t => {
    return x({ filter: filter, file: file, cwd: dir }, [ '🌟.txt', 'Ω.txt' ], er => {
      if (er)
        throw er
      check(t)
    })
  })

  t.end()
})

t.test('no file list', t => {
  const file = path.resolve(tars, 'body-byte-counts.tar')
  const dir = path.resolve(extractdir, 'no-list')

  t.beforeEach(cb => {
    rimraf.sync(dir)
    mkdirp.sync(dir)
    cb()
  })

  const check = t => {
    t.equal(fs.lstatSync(path.resolve(dir, '1024-bytes.txt')).size, 1024)
    t.equal(fs.lstatSync(path.resolve(dir, '512-bytes.txt')).size, 512)
    t.equal(fs.lstatSync(path.resolve(dir, 'one-byte.txt')).size, 1)
    t.equal(fs.lstatSync(path.resolve(dir, 'zero-byte.txt')).size, 0)
    rimraf.sync(dir)
    t.end()
  }

  t.test('sync', t => {
    x({ file: file, sync: true, C: dir })
    check(t)
  })

  t.test('async promisey', t => {
    return x({ file: file, cwd: dir }).then(_ => {
      check(t)
    })
  })

  t.test('async cb', t => {
    return x({ file: file, cwd: dir }, er => {
      if (er)
        throw er
      check(t)
    })
  })

  t.end()
})

t.test('read in itty bits', t => {
  const maxReadSize = 1000
  const file = path.resolve(tars, 'body-byte-counts.tar')
  const dir = path.resolve(extractdir, 'no-list')

  t.beforeEach(cb => {
    rimraf.sync(dir)
    mkdirp.sync(dir)
    cb()
  })

  const check = t => {
    t.equal(fs.lstatSync(path.resolve(dir, '1024-bytes.txt')).size, 1024)
    t.equal(fs.lstatSync(path.resolve(dir, '512-bytes.txt')).size, 512)
    t.equal(fs.lstatSync(path.resolve(dir, 'one-byte.txt')).size, 1)
    t.equal(fs.lstatSync(path.resolve(dir, 'zero-byte.txt')).size, 0)
    rimraf.sync(dir)
    t.end()
  }

  t.test('sync', t => {
    x({ file: file, sync: true, C: dir, maxReadSize: maxReadSize })
    check(t)
  })

  t.test('async promisey', t => {
    return x({ file: file, cwd: dir, maxReadSize: maxReadSize }).then(_ => {
      check(t)
    })
  })

  t.test('async cb', t => {
    return x({ file: file, cwd: dir, maxReadSize: maxReadSize }, er => {
      if (er)
        throw er
      check(t)
    })
  })

  t.end()
})

t.test('bad calls', t => {
  t.throws(_=> x(_=>_))
  t.throws(_=> x({sync: true}, _=>_))
  t.throws(_=> x({sync: true}, [], _=>_))
  t.end()
})

t.test('no file', t => {
  const Unpack = require('../lib/unpack.js')
  t.isa(x(), Unpack)
  t.isa(x(['asdf']), Unpack)
  t.isa(x({sync:true}), Unpack.Sync)
  t.end()
})

t.test('nonexistent', t => {
  t.throws(_ => x({sync: true, file: 'does not exist' }))
  x({ file: 'does not exist' }).catch(_ => t.end())
})

t.test('read fail', t => {
  const poop = new Error('poop')
  t.teardown(mutateFS.fail('read', poop))

  t.throws(_ => x({maxReadSize: 10, sync: true, file: __filename }), poop)
  t.end()
})

t.test('sync gzip error edge case test', t => {
  const zlib = require('minizlib')
  const file = path.resolve(__dirname, 'fixtures/sync-gzip-fail.tgz')
  const dir = path.resolve(__dirname, 'sync-gzip-fail')
  const cwd = process.cwd()
  mkdirp.sync(dir + '/x')
  process.chdir(dir)
  t.teardown(() => {
    process.chdir(cwd)
    rimraf.sync(dir)
  })

  x({
    sync: true,
    file: file,
    onwarn: (m, er) => { throw er }
  })

  t.same(fs.readdirSync(dir + '/x').sort(),
    [ '1', '10', '2', '3', '4', '5', '6', '7', '8', '9' ])

  t.end()
})

// A PAX header entry with a numeric-looking path (eg '12345') must be
// extracted as a file named '12345', not crash or skip, in strict and
// non-strict mode.  (CVE-2026-59871)
const Pax = require('../lib/pax.js')
const makeTar = require('./make-tar.js')

const makePaxExtractData = (paxName, entryName) => {
  const paxHeader = new Pax({ path: paxName, size: '12345\n'.length }, false)
  const paxData = paxHeader.encode()
  return makeTar([
    paxData,
    {
      type: 'File',
      path: entryName,
      mode: 0o755,
      ctime: new Date('2000-01-01T00:00:00.000Z'),
      mtime: new Date('2000-01-01T00:00:00.000Z'),
      size: '12345\n'.length
    },
    '12345\n',
    '',
    ''
  ])
}

const paxNameStricts = [ true, false ]
const paxNames = [ '12345', 'abcde' ]

paxNameStricts.forEach(strict => {
  paxNames.forEach(paxName => {
    paxNames.forEach(entryName => {
      const label = 'numeric pax/entry name discernment strict=' + strict +
        ' paxName=' + paxName + ' entryName=' + entryName
      const data = makePaxExtractData(paxName, entryName)

      const setup = which => {
        const dir = path.resolve(extractdir,
          'paxname-' + strict + '-' + paxName + '-' + entryName + '-' + which)
        rimraf.sync(dir)
        mkdirp.sync(dir)
        fs.writeFileSync(dir + '/tarFile', data)
        return dir
      }

      t.test(label + ' sync', t => {
        const dir = setup('sync')
        x({ strict: strict, sync: true, cwd: dir, file: dir + '/tarFile' })
        t.equal(fs.readFileSync(dir + '/' + paxName, 'utf8'), '12345\n')
        t.end()
      })

      t.test(label + ' async', t => {
        const dir = setup('async')
        x({ strict: strict, cwd: dir, file: dir + '/tarFile' }).then(() => {
          t.equal(fs.readFileSync(dir + '/' + paxName, 'utf8'), '12345\n')
          t.end()
        })
      })
    })
  })
})

// A compressed archive must not be expanded without bound: a few-KB gzip
// bomb otherwise inflates to unlimited memory/disk.  (CVE-2026-59873)
t.test('max decompression ratio', t => {
  const zlib = require('zlib')
  const payloadSize = 8 * 1024 * 1024
  // note: the payload is concatenated rather than passed to makeTar(), which
  // caps every chunk it is given at a single 512-byte block.
  const bomb = zlib.gzipSync(Buffer.concat([
    makeTar([{ path: 'bomb', size: payloadSize, type: 'File' }]),
    Buffer.alloc(payloadSize),
    makeTar([ '', '' ])
  ]))

  const bombdir = path.resolve(extractdir, 'bomb')
  const file = path.resolve(bombdir, 'bomb.tgz')
  const setup = which => {
    const dir = path.resolve(bombdir, which)
    rimraf.sync(dir)
    mkdirp.sync(dir)
    return dir
  }

  t.test('setup', t => {
    rimraf.sync(bombdir)
    mkdirp.sync(bombdir)
    fs.writeFileSync(file, bomb)
    t.end()
  })

  t.test('file extraction aborts by default', t => {
    const cwd = setup('sync-abort')
    t.throws(_ => x({ sync: true, file: file, cwd: cwd }), {
      message: /^max decompression ratio exceeded: /
    }, 'sync throws')

    const acwd = setup('async-abort')
    x({ file: file, cwd: acwd }).then(_ => {
      t.fail('async extraction should have been aborted')
      t.end()
    }, er => {
      t.match(er.message, /^max decompression ratio exceeded: /, 'async rejects')
      t.end()
    })
  })

  t.test('file extraction can disable the limit explicitly', t => {
    const cwd = setup('sync-unlimited')
    x({
      sync: true,
      file: file,
      cwd: cwd,
      maxDecompressionRatio: Infinity
    })
    t.equal(fs.statSync(path.resolve(cwd, 'bomb')).size, payloadSize,
      'sync extracted the whole file')

    const acwd = setup('async-unlimited')
    x({
      file: file,
      cwd: acwd,
      maxDecompressionRatio: Infinity
    }).then(_ => {
      t.equal(fs.statSync(path.resolve(acwd, 'bomb')).size, payloadSize,
        'async extracted the whole file')
      t.end()
    }, er => {
      t.fail(er.message)
      t.end()
    })
  })

  t.end()
})

// GHSA-r292-9mhp-454m: the recursion inside filesFilter()'s mapHas() must be
// bounded.  Given a files list, mapHas() walks a candidate entry's path up to
// the root one path.dirname() at a time, recursing once per path segment, so a
// crafted archive entry with a very deeply nested path crashes the process with
// an uncatchable stack overflow.
t.test('GHSA-r292-9mhp-454m deep path does not overflow stack', t => {
  // test/make-tar.js encodes the path through Header.encode(), which splits it
  // across the 155-byte prefix and 100-byte path fields and truncates whatever
  // does not fit, so an archived path cannot carry more than ~255 bytes.  The
  // archived entry below stays inside that budget; the recursion bound itself is
  // exercised through the installed filter directly, in the last subtest.
  const segments = []
  for (let i = 0; i < 40; i++)
    segments.push('x' + i)
  const deepPath = segments.join('/')
  const data = makeTar([
    { path: deepPath, type: 'File', size: 0 },
    '',
    ''
  ])

  t.test('unmatched deep path extracts nothing', t => {
    const dir = path.resolve(extractdir, 'ghsa-r292')
    rimraf.sync(dir)
    mkdirp.sync(dir)

    // A files list that does NOT include deepPath is what triggers mapHas() to
    // walk all the way up to the root, one dirname() at a time.
    const u = x({ cwd: dir }, [ 'some/other/path' ])
    u.on('error', er => { throw er })
    u.on('close', _ => {
      t.same(fs.readdirSync(dir), [],
        'no files extracted for unmatched deep path')
      rimraf.sync(dir)
      t.end()
    })
    u.end(data)
  })

  // filesFilter() installs the mapHas() closure as opt.filter, and Unpack
  // inherits Parser's this.filter, so the bound can be driven with a path far
  // deeper than any tar header is able to carry.  Unbounded, this dies with
  // 'RangeError: Maximum call stack size exceeded'.
  t.test('depth bound stops runaway recursion', t => {
    const deeper = []
    for (let i = 0; i < 20000; i++)
      deeper.push('y' + i)
    const veryDeepPath = deeper.join('/')

    const u = x({}, [ 'some/other/path' ])
    t.equal(typeof u.filter, 'function', 'files list installed a filter')

    let threw = null
    let result = null
    try {
      result = u.filter(veryDeepPath, {})
    } catch (er) {
      threw = er
    }
    t.equal(threw, null, 'no stack overflow walking a 20000-segment path')
    t.equal(result, false, 'unmatched deep path is filtered out')
    t.end()
  })

  t.end()
})
