'use strict'

process.umask(0o022)

const Unpack = require('../lib/unpack.js')
const UnpackSync = Unpack.Sync
const t = require('tap')
const MiniPass = require('minipass')

const makeTar = require('./make-tar.js')
const Header = require('../lib/header.js')
const z = require('minizlib')
const fs = require('fs')
const os = require('os')
const path = require('path')
const fixtures = path.resolve(__dirname, 'fixtures')
const files = path.resolve(fixtures, 'files')
const tars = path.resolve(fixtures, 'tars')
const parses = path.resolve(fixtures, 'parse')
const unpackdir = path.resolve(fixtures, 'unpack')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const mutateFS = require('mutate-fs')
const eos = require('end-of-stream')
const requireInject = require('./utils/require-inject.js')
const isWindows = process.platform === 'win32'
const ReadEntry = require('../lib/read-entry.js')

t.teardown(_ => rimraf.sync(unpackdir))

t.test('setup', t => {
  rimraf.sync(unpackdir)
  mkdirp.sync(unpackdir)
  t.end()
})

const testdir = () => {
  const testdirpath = path.resolve(unpackdir, Math.random().toString())
  rimraf.sync(testdirpath)
  mkdirp.sync(testdirpath)
  return testdirpath
}

// [...map.entries()] is a SyntaxError on node 4, which is in the support
// matrix, so materialize + sort the dirCache the long way round.
const cacheEntries = cache => {
  const entries = []
  cache.forEach((val, key) => entries.push([key, val]))
  return entries.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
}

t.test('basic file unpack tests', t => {
  const basedir = path.resolve(unpackdir, 'basic')
  t.teardown(_ => rimraf.sync(basedir))

  const cases = {
    'emptypax.tar': {
      '🌟.txt': '🌟✧✩⭐︎✪✫✬✭✮⚝✯✰✵✶✷✸✹❂⭑⭒★☆✡☪✴︎✦✡️🔯✴️🌠\n',
      'one-byte.txt': 'a'
    },
    'body-byte-counts.tar': {
      '1024-bytes.txt': new Array(1024).join('x') + '\n',
      '512-bytes.txt': new Array(512).join('x') + '\n',
      'one-byte.txt': 'a',
      'zero-byte.txt': ''
    },
    'utf8.tar': {
      '🌟.txt': '🌟✧✩⭐︎✪✫✬✭✮⚝✯✰✵✶✷✸✹❂⭑⭒★☆✡☪✴︎✦✡️🔯✴️🌠\n',
      'Ω.txt': 'Ω',
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/Ω.txt': 'Ω'
    },
    'file.tar': {
      'one-byte.txt': 'a'
    },
    'global-header.tar': {
      'one-byte.txt': 'a'
    },
    'long-pax.tar': {
      '120-byte-filename-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc': 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    },
    'long-paths.tar': {
      '100-byte-filename-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc': 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      '120-byte-filename-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc': 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      '170-byte-filename-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc': 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/a.txt': 'short\n',
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc': 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc': 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc': 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/Ω.txt': 'Ω'
    }
  }

  const tarfiles = Object.keys(cases)
  t.plan(tarfiles.length)
  t.jobs = tarfiles.length

  tarfiles.forEach(tarfile => {
    t.test(tarfile, t => {
      const tf = path.resolve(tars, tarfile)
      const dir = path.resolve(basedir, tarfile)
      t.beforeEach(cb => {
        rimraf.sync(dir)
        mkdirp.sync(dir)
        cb()
      })

      const check = t => {
        const expect = cases[tarfile]
        Object.keys(expect).forEach(file => {
          const f = path.resolve(dir, file)
          t.equal(fs.readFileSync(f, 'utf8'), expect[file], file)
        })
        t.end()
      }

      t.plan(2)

      t.test('async unpack', t => {
        t.plan(2)
        t.test('strict', t => {
          const unpack = new Unpack({ cwd: dir, strict: true })
          fs.createReadStream(tf).pipe(unpack)
          eos(unpack, _ => check(t))
        })
        t.test('loose', t => {
          const unpack = new Unpack({ cwd: dir })
          fs.createReadStream(tf).pipe(unpack)
          eos(unpack, _ => check(t))
        })
      })

      t.test('sync unpack', t => {
        t.plan(2)
        t.test('strict', t => {
          const unpack = new UnpackSync({ cwd: dir })
          unpack.end(fs.readFileSync(tf))
          check(t)
        })
        t.test('loose', t => {
          const unpack = new UnpackSync({ cwd: dir })
          unpack.end(fs.readFileSync(tf))
          check(t)
        })
      })
    })
  })
})

t.test('cwd default to process cwd', t => {
  const u = new Unpack()
  const us = new UnpackSync()
  const cwd = process.cwd()
  t.equal(u.cwd, cwd)
  t.equal(us.cwd, cwd)
  t.end()
})

t.test('links!', t => {
  const dir = path.resolve(unpackdir, 'links')
  const data = fs.readFileSync(tars + '/links.tar')
  const stripData = fs.readFileSync(tars + '/links-strip.tar')

  t.plan(6)
  t.beforeEach(cb => mkdirp(dir, cb))
  t.afterEach(cb => rimraf(dir, cb))

  const check = t => {
    const hl1 = fs.lstatSync(dir + '/hardlink-1')
    const hl2 = fs.lstatSync(dir + '/hardlink-2')
    t.equal(hl1.dev, hl2.dev)
    t.equal(hl1.ino, hl2.ino)
    t.equal(hl1.nlink, 2)
    t.equal(hl2.nlink, 2)
    const sym = fs.lstatSync(dir + '/symlink')
    t.ok(sym.isSymbolicLink())
    t.equal(fs.readlinkSync(dir + '/symlink'), 'hardlink-2')
    t.end()
  }
  const checkForStrip = t => {
    const hl1 = fs.lstatSync(dir + '/hardlink-1')
    const hl2 = fs.lstatSync(dir + '/hardlink-2')
    const hl3 = fs.lstatSync(dir + '/1/2/3/hardlink-3')
    t.equal(hl1.dev, hl2.dev)
    t.equal(hl1.ino, hl2.ino)
    t.equal(hl1.dev, hl3.dev)
    t.equal(hl1.ino, hl3.ino)
    t.equal(hl1.nlink, 3)
    t.equal(hl2.nlink, 3)
    const sym = fs.lstatSync(dir + '/symlink')
    t.ok(sym.isSymbolicLink())
    t.equal(fs.readlinkSync(dir + '/symlink'), 'hardlink-2')
    t.end()
  }
  const checkForStrip3 = t => {
    t.ok(fs.lstatSync(dir + '/3').isDirectory())
    let err = null
    try {
      fs.lstatSync(dir + '/3/hardlink-3')
    } catch(e) {
      err = e
    }
    // can't be extracted because we've passed it in the tar (specially crafted tar for this not to work)
    t.equal(err.code, 'ENOENT')
    t.end()
  }

  t.test('async', t => {
    const unpack = new Unpack({ cwd: dir })
    let finished = false
    unpack.on('finish', _ => finished = true)
    unpack.on('close', _ => t.ok(finished, 'emitted finish before close'))
    unpack.on('close', _ => check(t))
    unpack.end(data)
  })

  t.test('sync', t => {
    const unpack = new UnpackSync({ cwd: dir })
    unpack.end(data)
    check(t)
  })

  t.test('sync strip', t => {
    const unpack = new UnpackSync({ cwd: dir, strip: 1 })
    unpack.end(fs.readFileSync(tars + '/links-strip.tar'))
    checkForStrip(t)
  })

  t.test('async strip', t => {
    const unpack = new Unpack({ cwd: dir, strip: 1 })
    let finished = false
    unpack.on('finish', _ => finished = true)
    unpack.on('close', _ => t.ok(finished, 'emitted finish before close'))
    unpack.on('close', _ => checkForStrip(t))
    unpack.end(stripData)
  })

  t.test('sync strip 3', t => {
    const unpack = new UnpackSync({ cwd: dir, strip: 3 })
    unpack.end(fs.readFileSync(tars + '/links-strip.tar'))
    checkForStrip3(t)
  })

  t.test('async strip 3', t => {
    const unpack = new Unpack({ cwd: dir, strip: 3 })
    let finished = false
    unpack.on('finish', _ => finished = true)
    unpack.on('close', _ => t.ok(finished, 'emitted finish before close'))
    unpack.on('close', _ => checkForStrip3(t))
    unpack.end(stripData)
  })
})

t.test('links without cleanup (exercise clobbering code)', t => {
  const dir = path.resolve(unpackdir, 'links')
  const data = fs.readFileSync(tars + '/links.tar')

  t.plan(6)
  mkdirp.sync(dir)
  t.teardown(_ => rimraf.sync(dir))

  t.beforeEach(cb => {
    // clobber this junk
    try {
      mkdirp.sync(dir + '/hardlink-1')
      mkdirp.sync(dir + '/hardlink-2')
      fs.writeFileSync(dir + '/symlink', 'not a symlink')
    } catch (er) {}
    cb()
  })

  const check = t => {
    const hl1 = fs.lstatSync(dir + '/hardlink-1')
    const hl2 = fs.lstatSync(dir + '/hardlink-2')
    t.equal(hl1.dev, hl2.dev)
    t.equal(hl1.ino, hl2.ino)
    t.equal(hl1.nlink, 2)
    t.equal(hl2.nlink, 2)
    const sym = fs.lstatSync(dir + '/symlink')
    t.ok(sym.isSymbolicLink())
    t.equal(fs.readlinkSync(dir + '/symlink'), 'hardlink-2')
    t.end()
  }

  t.test('async', t => {
    const unpack = new Unpack({ cwd: dir })
    let prefinished = false
    unpack.on('prefinish', _ => prefinished = true)
    unpack.on('finish', _ =>
      t.ok(prefinished, 'emitted prefinish before finish'))
    unpack.on('close', _ => check(t))
    unpack.end(data)
  })

  t.test('sync', t => {
    const unpack = new UnpackSync({ cwd: dir })
    unpack.end(data)
    check(t)
  })

  t.test('async again', t => {
    const unpack = new Unpack({ cwd: dir })
    eos(unpack, _ => check(t))
    unpack.end(data)
  })

  t.test('sync again', t => {
    const unpack = new UnpackSync({ cwd: dir })
    unpack.end(data)
    check(t)
  })

  t.test('async unlink', t => {
    const unpack = new Unpack({ cwd: dir, unlink: true })
    unpack.on('close', _ => check(t))
    unpack.end(data)
  })

  t.test('sync unlink', t => {
    const unpack = new UnpackSync({ cwd: dir, unlink: true })
    unpack.end(data)
    check(t)
  })
})

t.test('nested dir dupe', t => {
  const dir = path.resolve(unpackdir, 'nested-dir')
  mkdirp.sync(dir + '/d/e/e/p')
  t.teardown(_ => rimraf.sync(dir))
  const expect = {
    'd/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/a.txt': 'short\n',
    'd/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc': 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'd/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc': 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'd/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc': 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'd/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/Ω.txt': 'Ω'
  }

  const check = t => {
    const entries = fs.readdirSync(dir)
    t.equal(entries.length, 1)
    t.equal(entries[0], 'd')
    Object.keys(expect).forEach(f => {
      const file = dir + '/' + f
      t.equal(fs.readFileSync(file, 'utf8'), expect[f])
    })
    t.end()
  }

  const unpack = new Unpack({ cwd: dir, strip: 8 })
  const data = fs.readFileSync(tars + '/long-paths.tar')
  // while we're at it, why not use gzip too?
  const zip = new z.Gzip()
  zip.pipe(unpack)
  unpack.on('close', _ => check(t))
  zip.end(data)
})

t.test('symlink in dir path', t => {
  const dir = path.resolve(unpackdir, 'symlink-junk')

  t.teardown(_ => rimraf.sync(dir))
  t.beforeEach(cb => {
    rimraf.sync(dir)
    mkdirp.sync(dir)
    cb()
  })

  const data = makeTar([
    {
      path: 'd/i',
      type: 'Directory'
    },
    {
      path: 'd/i/r/dir',
      type: 'Directory',
      mode: 0o751,
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    {
      path: 'd/i/r/file',
      type: 'File',
      size: 1,
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z')
    },
    'a',
    {
      path: 'd/i/r/link',
      type: 'Link',
      linkpath: 'd/i/r/file',
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    {
      path: 'd/i/r/symlink',
      type: 'SymbolicLink',
      linkpath: './dir',
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    {
      path: 'd/i/r/symlink/x',
      type: 'File',
      size: 0,
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    '',
    ''
  ])

  t.test('no clobbering', t => {
    const warnings = []
    const u = new Unpack({ cwd: dir, onwarn: (w,d) => warnings.push([w,d]) })
    u.on('close', _ => {
      t.equal(fs.lstatSync(dir + '/d/i').mode & 0o7777, 0o755)
      t.equal(fs.lstatSync(dir + '/d/i/r/dir').mode & 0o7777, 0o751)
      t.ok(fs.lstatSync(dir + '/d/i/r/file').isFile(), 'got file')
      t.ok(fs.lstatSync(dir + '/d/i/r/symlink').isSymbolicLink(), 'got symlink')
      t.throws(_ => fs.statSync(dir + '/d/i/r/symlink/x'))
      t.equal(warnings.length, 1)
      t.equal(warnings[0][0], 'Cannot extract through symbolic link')
      t.match(warnings[0][1], {
        name: 'SylinkError',
        path: dir + '/d/i/r/symlink/',
        symlink: dir + '/d/i/r/symlink'
      })
      t.end()
    })
    u.end(data)
  })

  t.test('no clobbering, sync', t => {
    const warnings = []
    const u = new UnpackSync({
      cwd: dir,
      onwarn: (w,d) => warnings.push([w,d])
    })
    u.end(data)
    t.equal(fs.lstatSync(dir + '/d/i/r/dir').mode & 0o7777, 0o751)
    t.ok(fs.lstatSync(dir + '/d/i/r/file').isFile(), 'got file')
    t.ok(fs.lstatSync(dir + '/d/i/r/symlink').isSymbolicLink(), 'got symlink')
    t.throws(_ => fs.statSync(dir + '/d/i/r/symlink/x'))
    t.equal(warnings.length, 1)
    t.equal(warnings[0][0], 'Cannot extract through symbolic link')
    t.match(warnings[0][1], {
      name: 'SylinkError',
      path: dir + '/d/i/r/symlink/',
      symlink: dir + '/d/i/r/symlink'
    })
    t.end()
  })

  t.test('extract through symlink', t => {
    const warnings = []
    const u = new Unpack({
      cwd: dir,
      onwarn: (w,d) => warnings.push([w,d]),
      preservePaths: true
    })
    u.on('close', _ => {
      t.same(warnings, [])
      t.equal(fs.lstatSync(dir + '/d/i/r/dir').mode & 0o7777, 0o751)
      t.ok(fs.lstatSync(dir + '/d/i/r/file').isFile(), 'got file')
      t.ok(fs.lstatSync(dir + '/d/i/r/symlink').isSymbolicLink(), 'got symlink')
      t.ok(fs.lstatSync(dir + '/d/i/r/dir/x').isFile(), 'x thru link')
      t.ok(fs.lstatSync(dir + '/d/i/r/symlink/x').isFile(), 'x thru link')
      t.end()
    })
    u.end(data)
  })

  t.test('extract through symlink sync', t => {
    const warnings = []
    const u = new UnpackSync({
      cwd: dir,
      onwarn: (w,d) => warnings.push([w,d]),
      preservePaths: true
    })
    u.end(data)
    t.same(warnings, [])
    t.equal(fs.lstatSync(dir + '/d/i/r/dir').mode & 0o7777, 0o751)
    t.ok(fs.lstatSync(dir + '/d/i/r/file').isFile(), 'got file')
    t.ok(fs.lstatSync(dir + '/d/i/r/symlink').isSymbolicLink(), 'got symlink')
    t.ok(fs.lstatSync(dir + '/d/i/r/dir/x').isFile(), 'x thru link')
    t.ok(fs.lstatSync(dir + '/d/i/r/symlink/x').isFile(), 'x thru link')
    t.end()
  })

  t.test('clobber through symlink', t => {
    const warnings = []
    const u = new Unpack({
      cwd: dir,
      onwarn: (w,d) => warnings.push([w,d]),
      unlink: true
    })
    u.on('close', _ => {
      t.same(warnings, [])
      t.equal(fs.lstatSync(dir + '/d/i/r/dir').mode & 0o7777, 0o751)
      t.ok(fs.lstatSync(dir + '/d/i/r/file').isFile(), 'got file')
      t.notok(fs.lstatSync(dir + '/d/i/r/symlink').isSymbolicLink(), 'no link')
      t.ok(fs.lstatSync(dir + '/d/i/r/symlink').isDirectory(), 'sym is dir')
      t.ok(fs.lstatSync(dir + '/d/i/r/symlink/x').isFile(), 'x thru link')
      t.end()
    })
    u.end(data)
  })

  t.test('clobber through symlink with busted unlink', t => {
    const poop = new Error('poop')
    t.teardown(mutateFS.fail('unlink', poop))
    const warnings = []
    const u = new Unpack({
      cwd: dir,
      onwarn: (w,d) => warnings.push([w,d]),
      unlink: true
    })
    u.on('close', _ => {
      t.same(warnings, [[ 'poop', poop ]])
      t.end()
    })
    u.end(data)
  })

  t.test('clobber through symlink sync', t => {
    const warnings = []
    const u = new UnpackSync({
      cwd: dir,
      onwarn: (w,d) => warnings.push([w,d]),
      unlink: true
    })
    u.end(data)
    t.equal(fs.lstatSync(dir + '/d/i/r/dir').mode & 0o7777, 0o751)
    t.ok(fs.lstatSync(dir + '/d/i/r/file').isFile(), 'got file')
    t.notok(fs.lstatSync(dir + '/d/i/r/symlink').isSymbolicLink(), 'no link')
    t.ok(fs.lstatSync(dir + '/d/i/r/symlink').isDirectory(), 'sym is dir')
    t.ok(fs.lstatSync(dir + '/d/i/r/symlink/x').isFile(), 'x thru link')
    t.end()
  })

  t.test('clobber dirs', t => {
    mkdirp.sync(dir + '/d/i/r/dir')
    mkdirp.sync(dir + '/d/i/r/file')
    mkdirp.sync(dir + '/d/i/r/link')
    mkdirp.sync(dir + '/d/i/r/symlink')
    const warnings = []
    const u = new Unpack({
      cwd: dir,
      onwarn: (w, d) => {
        warnings.push([w,d])
      }
    })
    u.on('close', _ => {
      t.equal(fs.lstatSync(dir + '/d/i/r/dir').mode & 0o7777, 0o751)
      t.ok(fs.lstatSync(dir + '/d/i/r/file').isFile(), 'got file')
      t.ok(fs.lstatSync(dir + '/d/i/r/symlink').isSymbolicLink(), 'got symlink')
      t.throws(_ => fs.statSync(dir + '/d/i/r/symlink/x'))
      t.equal(warnings.length, 1)
      t.equal(warnings[0][0], 'Cannot extract through symbolic link')
      t.match(warnings[0][1], {
        name: 'SylinkError',
        path: dir + '/d/i/r/symlink/',
        symlink: dir + '/d/i/r/symlink'
      })
      t.end()
    })
    u.end(data)
  })

  t.test('clobber dirs sync', t => {
    mkdirp.sync(dir + '/d/i/r/dir')
    mkdirp.sync(dir + '/d/i/r/file')
    mkdirp.sync(dir + '/d/i/r/link')
    mkdirp.sync(dir + '/d/i/r/symlink')
    const warnings = []
    const u = new UnpackSync({
      cwd: dir,
      onwarn: (w, d) => {
        warnings.push([w,d])
      }
    })
    u.end(data)
    t.equal(fs.lstatSync(dir + '/d/i/r/dir').mode & 0o7777, 0o751)
    t.ok(fs.lstatSync(dir + '/d/i/r/file').isFile(), 'got file')
    t.ok(fs.lstatSync(dir + '/d/i/r/symlink').isSymbolicLink(), 'got symlink')
    t.throws(_ => fs.statSync(dir + '/d/i/r/symlink/x'))
    t.equal(warnings.length, 1)
    t.equal(warnings[0][0], 'Cannot extract through symbolic link')
    t.match(warnings[0][1], {
      name: 'SylinkError',
      path: dir + '/d/i/r/symlink/',
      symlink: dir + '/d/i/r/symlink'
    })
    t.end()
  })

  t.end()
})

t.test('unsupported entries', t => {
  const dir = path.resolve(unpackdir, 'unsupported-entries')
  mkdirp.sync(dir)
  t.teardown(_ => rimraf.sync(dir))
  const unknown = new Header({ path: 'qux', type: 'File', size: 4 })
  unknown.type = 'Z'
  unknown.encode()
  const data = makeTar([
    {
      path: 'dev/random',
      type: 'CharacterDevice'
    },
    {
      path: 'dev/hd0',
      type: 'BlockDevice'
    },
    {
      path: 'dev/fifo0',
      type: 'FIFO'
    },
    unknown.block,
    'asdf',
    '',
    ''
  ])

  t.test('basic, warns', t => {
    const warnings = []
    const u = new Unpack({ cwd: dir, onwarn: (w,d) => warnings.push([w,d]) })
    const expect = [
      ['unsupported entry type: CharacterDevice', { path: 'dev/random' }],
      ['unsupported entry type: BlockDevice', { path: 'dev/hd0' }],
      ['unsupported entry type: FIFO', { path: 'dev/fifo0' }]
    ]
    u.on('close', _ => {
      t.equal(fs.readdirSync(dir).length, 0)
      t.match(warnings, expect)
      t.end()
    })
    u.end(data)
  })

  t.test('strict, throws', t => {
    const warnings = []
    const errors = []
    const u = new Unpack({
      cwd: dir,
      strict: true,
      onwarn: (w,d) => warnings.push([w,d])
    })
    u.on('error', e => errors.push(e))
    u.on('close', _ => {
      t.equal(fs.readdirSync(dir).length, 0)
      t.same(warnings, [])
      t.match(errors, [
        {
          message: 'unsupported entry type: CharacterDevice',
          data: { path: 'dev/random' }
        },
        {
          message: 'unsupported entry type: BlockDevice',
          data: { path: 'dev/hd0' }
        },
        {
          message: 'unsupported entry type: FIFO',
          data: { path: 'dev/fifo0' }
        }
      ])
      t.end()
    })
    u.end(data)
  })

  t.end()
})


t.test('file in dir path', t => {
  const dir = path.resolve(unpackdir, 'file-junk')

  t.teardown(_ => rimraf.sync(dir))
  t.beforeEach(cb => {
    rimraf.sync(dir)
    mkdirp.sync(dir)
    cb()
  })

  const data = makeTar([
    {
      path: 'd/i/r/file',
      type: 'File',
      size: 1,
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    'a',
    {
      path: 'd/i/r/file/a/b/c',
      type: 'File',
      size: 1,
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    'b',
    '',
    ''
  ])

  t.test('fail because of file', t => {
    const check = t => {
      t.equal(fs.readFileSync(dir + '/d/i/r/file', 'utf8'), 'a')
      t.throws(_ => fs.statSync(dir + '/d/i/r/file/a/b/c'))
      t.end()
    }

    t.plan(2)

    t.test('async', t => {
      new Unpack({ cwd: dir }).on('close', _ => check(t)).end(data)
    })

    t.test('sync', t => {
      new UnpackSync({ cwd: dir }).end(data)
      check(t)
    })
  })

  t.test('clobber on through', t => {
    const check = t => {
      t.ok(fs.statSync(dir + '/d/i/r/file').isDirectory())
      t.equal(fs.readFileSync(dir + '/d/i/r/file/a/b/c', 'utf8'), 'b')
      t.end()
    }

    t.plan(2)

    t.test('async', t => {
      new Unpack({ cwd: dir, unlink: true }).on('close', _ => check(t)).end(data)
    })

    t.test('sync', t => {
      new UnpackSync({ cwd: dir, unlink: true }).end(data)
      check(t)
    })
  })

  t.end()
})

t.test('set umask option', t => {
  const dir = path.resolve(unpackdir, 'umask')
  mkdirp.sync(dir)
  t.tearDown(_ => rimraf.sync(dir))

  const data = makeTar([
    {
      path: 'd/i/r/dir',
      type: 'Directory',
      mode: 0o751
    },
    '',
    ''
  ])

  new Unpack({
    umask: 0o027,
    cwd: dir
  }).on('close', _ => {
    t.equal(fs.statSync(dir + '/d/i/r').mode & 0o7777, 0o750)
    t.equal(fs.statSync(dir + '/d/i/r/dir').mode & 0o7777, 0o751)
    t.end()
  }).end(data)
})

t.test('absolute paths', t => {
  const dir = path.join(unpackdir, 'absolute-paths')
  t.teardown(_ => rimraf.sync(dir))
  t.beforeEach(cb => {
    rimraf.sync(dir)
    mkdirp.sync(dir)
    cb()
  })

  const absolute = path.resolve(dir, 'd/i/r/absolute')
  t.ok(path.isAbsolute(absolute))
  const parsed = path.parse(absolute)
  const relative = absolute.substr(parsed.root.length)
  t.notOk(path.isAbsolute(relative))

  // stack up several roots, so that stripping just one is not enough to
  // make the path relative
  const extraAbsolute = parsed.root + parsed.root + parsed.root + absolute
  t.ok(path.isAbsolute(extraAbsolute))

  const data = makeTar([
    {
      path: extraAbsolute,
      type: 'File',
      size: 1,
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    'a',
    '',
    ''
  ])

  // list every file under d, as paths relative to it
  const findFiles = (d, prefix) => {
    const found = []
    fs.readdirSync(d).forEach(e => {
      const full = d + '/' + e
      const rel = prefix ? prefix + '/' + e : e
      if (fs.lstatSync(full).isDirectory())
        found.push.apply(found, findFiles(full, rel))
      else
        found.push(rel)
    })
    return found
  }

  t.test('warn and correct', t => {
    const check = t => {
      t.equal(warnings.length, 1)
      t.match(warnings[0][0], /^stripping .+ from absolute path$/)
      t.equal(warnings[0][1], extraAbsolute)
      // every stacked root gets stripped, so the entry lands under the cwd,
      // rather than remaining absolute after a single strip
      const found = findFiles(dir)
      t.equal(found.length, 1, 'exactly one file extracted')
      t.equal(path.basename(found[0]), 'absolute')
      t.equal(fs.readFileSync(path.resolve(dir, found[0]), 'utf8'), 'a')
      t.end()
    }

    const warnings = []

    t.test('async', t => {
      warnings.length = 0
      new Unpack({
        cwd: dir,
        onwarn: (w, d) => warnings.push([w, d])
      }).on('close', _=> check(t)).end(data)
    })

    t.test('sync', t => {
      warnings.length = 0
      new UnpackSync({
        cwd: dir,
        onwarn: (w, d) => warnings.push([w, d])
      }).end(data)
      check(t)
    })

    t.end()
  })

  t.test('preserve absolute path', t => {
    const check = t => {
      t.same(warnings, [])
      t.ok(fs.lstatSync(absolute).isFile(), 'is file')
      t.end()
    }

    const warnings = []

    t.test('async', t => {
      warnings.length = 0
      new Unpack({
        preservePaths: true,
        cwd: dir,
        onwarn: (w, d) => warnings.push([w, d])
      }).on('close', _=> check(t)).end(data)
    })

    t.test('sync', t => {
      warnings.length = 0
      new UnpackSync({
        preservePaths: true,
        cwd: dir,
        onwarn: (w, d) => warnings.push([w, d])
      }).end(data)
      check(t)
    })

    t.end()
  })

  t.end()
})

t.test('.. paths', t => {
  const dir = path.join(unpackdir, 'dotted-paths')
  t.teardown(_ => rimraf.sync(dir))
  t.beforeEach(cb => {
    rimraf.sync(dir)
    mkdirp.sync(dir)
    cb()
  })

  const fmode = 0o755
  const dotted = 'a/b/c/../d'
  const resolved = path.resolve(dir, dotted)

  const data = makeTar([
    {
      path: dotted,
      type: 'File',
      size: 1,
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    'd',
    '',
    ''
  ])

  t.test('warn and skip', t => {
    const check = t => {
      t.same(warnings, [[
        'path contains \'..\'',
        dotted
      ]])
      t.throws(_=>fs.lstatSync(resolved))
      t.end()
    }

    const warnings = []

    t.test('async', t => {
      warnings.length = 0
      new Unpack({
        fmode: fmode,
        cwd: dir,
        onwarn: (w, d) => warnings.push([w, d])
      }).on('close', _=> check(t)).end(data)
    })

    t.test('sync', t => {
      warnings.length = 0
      new UnpackSync({
        fmode: fmode,
        cwd: dir,
        onwarn: (w, d) => warnings.push([w, d])
      }).end(data)
      check(t)
    })

    t.end()
  })

  t.test('preserve dotted path', t => {
    const check = t => {
      t.same(warnings, [])
      t.ok(fs.lstatSync(resolved).isFile(), 'is file')
      t.equal(fs.lstatSync(resolved).mode & 0o777, fmode, 'mode is 0755')
      t.end()
    }

    const warnings = []

    t.test('async', t => {
      warnings.length = 0
      new Unpack({
        fmode: fmode,
        preservePaths: true,
        cwd: dir,
        onwarn: (w, d) => warnings.push([w, d])
      }).on('close', _=> check(t)).end(data)
    })

    t.test('sync', t => {
      warnings.length = 0
      new UnpackSync({
        fmode: fmode,
        preservePaths: true,
        cwd: dir,
        onwarn: (w, d) => warnings.push([w, d])
      }).end(data)
      check(t)
    })

    t.end()
  })

  t.end()
})

t.test('drive-relative paths', t => {
  const dir = path.join(unpackdir, 'drive-relative-paths')
  const cwd = path.resolve(dir, 'cwd')
  t.teardown(_ => rimraf.sync(dir))

  const setup = _ => {
    rimraf.sync(dir)
    mkdirp.sync(cwd)
  }

  const tarWithPath = p => makeTar([
    {
      path: p,
      type: 'File',
      size: 1,
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    'a',
    '',
    ''
  ])

  // A windows drive-relative path like 'c:..\foo\bar' is not absolute, and
  // its '..' is not preceded by a path separator, so it can slip past a
  // naive dotdot check and then resolve outside of the cwd on windows.
  const escapes = [
    'c:..\\foo\\bar',
    'c:../foo/bar',
    '/c:../foo/bar',
    'c:..'
  ]

  escapes.forEach(p => t.test('reject ' + JSON.stringify(p), t => {
    const data = tarWithPath(p)
    const warnings = []

    const check = t => {
      t.same(warnings, [[
        'path contains \'..\'',
        p
      ]], 'warned about the dotted path')
      t.same(fs.readdirSync(cwd), [], 'nothing extracted into cwd')
      t.same(fs.readdirSync(dir), [ 'cwd' ], 'nothing escaped the cwd')
      t.end()
    }

    t.test('async', t => {
      setup()
      warnings.length = 0
      new Unpack({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).on('close', _ => check(t)).end(data)
    })

    t.test('sync', t => {
      setup()
      warnings.length = 0
      new UnpackSync({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).end(data)
      check(t)
    })

    t.end()
  }))

  // the drive root gets stripped, just like any other absolute root, so a
  // harmless drive-relative path still lands inside the cwd
  t.test('strip drive root', t => {
    const p = 'c:foo/bar'
    const data = tarWithPath(p)
    const warnings = []

    const check = t => {
      t.same(warnings, [[
        'stripping c: from absolute path',
        p
      ]], 'warned about stripping the drive root')
      t.ok(fs.lstatSync(path.resolve(cwd, 'foo/bar')).isFile(), 'is file')
      t.end()
    }

    t.test('async', t => {
      setup()
      warnings.length = 0
      new Unpack({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).on('close', _ => check(t)).end(data)
    })

    t.test('sync', t => {
      setup()
      warnings.length = 0
      new UnpackSync({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).end(data)
      check(t)
    })

    t.end()
  })

  t.end()
})

t.test('linkpath escapes extraction directory', t => {
  const dir = path.join(unpackdir, 'linkpath-escape')
  const cwd = path.resolve(dir, 'cwd')
  t.teardown(_ => rimraf.sync(dir))

  const setup = _ => {
    rimraf.sync(dir)
    mkdirp.sync(cwd)
  }

  const tarWithLink = (p, lp) => makeTar([
    {
      path: p,
      type: 'SymbolicLink',
      linkpath: lp,
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    '',
    ''
  ])

  // A rooted linkpath is written to disk verbatim, so once its root is
  // dropped, the remaining '..' parts can walk out of the extraction dir.
  const escapes = [
    { path: 'a/b/link', linkpath: 'c:..\\..\\..\\..\\foo\\bar' },
    { path: 'a/b/link', linkpath: 'c:../../../foo/bar' },
    { path: 'a/b/link', linkpath: '/c:../../../foo/bar' },
    { path: 'link', linkpath: 'c:..' }
  ]

  escapes.forEach(c => t.test('reject ' + JSON.stringify(c.linkpath), t => {
    const data = tarWithLink(c.path, c.linkpath)
    const warnings = []

    const check = t => {
      t.same(warnings, [[
        'linkpath escapes extraction directory',
        c.linkpath
      ]], 'warned about the escaping linkpath')
      t.throws(_ => fs.lstatSync(path.resolve(cwd, c.path)),
        'escaping symlink is not created')
      t.same(fs.readdirSync(cwd), [], 'nothing extracted into cwd')
      t.same(fs.readdirSync(dir), [ 'cwd' ], 'nothing escaped the cwd')
      t.end()
    }

    t.test('async', t => {
      setup()
      warnings.length = 0
      new Unpack({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).on('close', _ => check(t)).end(data)
    })

    t.test('sync', t => {
      setup()
      warnings.length = 0
      new UnpackSync({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).end(data)
      check(t)
    })

    t.end()
  }))

  // a rooted linkpath that stays inside the extraction dir once resolved does
  // not trip the escape check above, so only its root is stripped.  The '..'
  // left behind is allowed, because a symbolic link pointing up out of the
  // extraction dir is inert on its own -- what matters is that nothing is
  // extracted *through* it.
  t.test('allow non-escaping but rooted dotted linkpath', t => {
    const lp = 'c:..\\foo\\bar'
    const data = tarWithLink('a/b/ok', lp)
    const warnings = []

    const check = t => {
      t.same(warnings, [[
        'stripping c: from absolute linkpath',
        lp
      ]], 'warned about stripping the linkpath root')
      const sym = path.resolve(cwd, 'a/b/ok')
      t.ok(fs.lstatSync(sym).isSymbolicLink(), 'is symlink')
      t.equal(fs.readlinkSync(sym), '..\\foo\\bar',
        'linkpath is no longer rooted')
      t.same(fs.readdirSync(cwd), [ 'a' ], 'only extracted into cwd')
      t.same(fs.readdirSync(dir), [ 'cwd' ], 'nothing escaped the cwd')
      t.end()
    }

    t.test('async', t => {
      setup()
      warnings.length = 0
      new Unpack({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).on('close', _ => check(t)).end(data)
    })

    t.test('sync', t => {
      setup()
      warnings.length = 0
      new UnpackSync({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).end(data)
      check(t)
    })

    t.end()
  })

  // negative control: a rootless linkpath with no '..' in it is harmless, and
  // must still be written to disk verbatim with no warnings at all, so that
  // neither the escape check nor the generic sanitization is over-broad
  t.test('allow plain relative linkpath', t => {
    const lp = 'foo/bar'
    const data = tarWithLink('a/b/ok', lp)
    const warnings = []

    const check = t => {
      t.same(warnings, [], 'no warnings')
      t.ok(fs.lstatSync(path.resolve(cwd, 'a/b/ok')).isSymbolicLink(),
        'is symlink')
      t.equal(fs.readlinkSync(path.resolve(cwd, 'a/b/ok')), lp,
        'linkpath is not modified')
      t.end()
    }

    t.test('async', t => {
      setup()
      warnings.length = 0
      new Unpack({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).on('close', _ => check(t)).end(data)
    })

    t.test('sync', t => {
      setup()
      warnings.length = 0
      new UnpackSync({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).end(data)
      check(t)
    })

    t.end()
  })

  t.end()
})

t.test('fail all stats', t => {
  const poop = new Error('poop')
  poop.code = 'EPOOP'
  let unmutate
  const dir = path.join(unpackdir, 'stat-fail')

  const warnings = []
  t.beforeEach(cb => {
    warnings.length = 0
    mkdirp.sync(dir)
    unmutate = mutateFS.statFail(poop)
    cb()
  })
  t.afterEach(cb => {
    unmutate()
    rimraf.sync(dir)
    cb()
  })

  const data = makeTar([
    {
      path: 'd/i/r/file/',
      type: 'Directory',
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    {
      path: 'd/i/r/dir/',
      type: 'Directory',
      mode: 0o751,
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    {
      path: 'd/i/r/file',
      type: 'File',
      size: 1,
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    'a',
    {
      path: 'd/i/r/link',
      type: 'Link',
      linkpath: 'd/i/r/file',
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    {
      path: 'd/i/r/symlink',
      type: 'SymbolicLink',
      linkpath: './dir',
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    '',
    ''
  ])

  const check = (t, expect) => {
    t.match(warnings, expect)
    warnings.forEach(w => t.equal(w[0], w[1].message))
    t.end()
  }

  t.test('async', t => {
    const expect = [
      ['poop', poop],
      ['poop', poop]
    ]
    new Unpack({
      cwd: dir,
      onwarn: (w, d) => warnings.push([w, d])
    }).on('close', _ => check(t, expect)).end(data)
  })

  t.test('sync', t => {
    const expect = [
      [
        String,
        {
          code: 'EISDIR',
          path: path.resolve(dir, 'd/i/r/file'),
          syscall: 'open'
        }
      ],
      [
        String,
        {
          dest: path.resolve(dir, 'd/i/r/link'),
          path: path.resolve(dir, 'd/i/r/file'),
          syscall: 'link'
        }
      ]
    ]
    new UnpackSync({
      cwd: dir,
      onwarn: (w, d) => warnings.push([w, d])
    }).end(data)
    check(t, expect)
  })

  t.end()
})

t.test('fail symlink', t => {
  const poop = new Error('poop')
  poop.code = 'EPOOP'
  const unmutate = mutateFS.fail('symlink', poop)
  const dir = path.join(unpackdir, 'symlink-fail')
  t.teardown(_ => (unmutate(), rimraf.sync(dir)))

  const warnings = []
  t.beforeEach(cb => {
    warnings.length = 0
    rimraf.sync(dir)
    mkdirp.sync(dir)
    cb()
  })

  const data = makeTar([
    {
      path: 'd/i/r/dir/',
      type: 'Directory',
      mode: 0o751,
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    {
      path: 'd/i/r/symlink',
      type: 'SymbolicLink',
      linkpath: './dir',
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    '',
    ''
  ])

  const check = (t, expect) => {
    t.match(warnings, expect)
    warnings.forEach(w => t.equal(w[0], w[1].message))
    t.end()
  }

  t.test('async', t => {
    const expect = [['poop', poop]]
    new Unpack({
      cwd: dir,
      onwarn: (w, d) => warnings.push([w, d])
    }).on('close', _ => check(t, expect)).end(data)
  })

  t.test('sync', t => {
    const expect = [['poop', poop]]
    new UnpackSync({
      cwd: dir,
      onwarn: (w, d) => warnings.push([w, d])
    }).end(data)
    check(t, expect)
  })

  t.end()
})

t.test('fail chmod', t => {
  const poop = new Error('poop')
  poop.code = 'EPOOP'
  const unmutate = mutateFS.fail('chmod', poop)
  const dir = path.join(unpackdir, 'chmod-fail')
  t.teardown(_ => (unmutate(), rimraf.sync(dir)))

  const warnings = []
  t.beforeEach(cb => {
    warnings.length = 0
    rimraf.sync(dir)
    mkdirp.sync(dir)
    cb()
  })

  const data = makeTar([
    {
      path: 'd/i/r/dir/',
      type: 'Directory',
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    {
      path: 'd/i/r/dir/',
      type: 'Directory',
      mode: 0o751,
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    '',
    ''
  ])

  const check = (t, expect) => {
    t.match(warnings, expect)
    warnings.forEach(w => t.equal(w[0], w[1].message))
    t.end()
  }

  t.test('async', t => {
    const expect = [['poop', poop]]
    new Unpack({
      cwd: dir,
      onwarn: (w, d) => warnings.push([w, d])
    }).on('close', _ => check(t, expect)).end(data)
  })

  t.test('sync', t => {
    const expect = [['poop', poop]]
    new UnpackSync({
      cwd: dir,
      onwarn: (w, d) => warnings.push([w, d])
    }).end(data)
    check(t, expect)
  })

  t.end()
})

t.test('fail mkdir', t => {
  const poop = new Error('poop')
  poop.code = 'EPOOP'
  let unmutate
  const dir = path.join(unpackdir, 'mkdir-fail')
  t.teardown(_ => rimraf.sync(dir))

  const warnings = []
  t.beforeEach(cb => {
    warnings.length = 0
    rimraf.sync(dir)
    mkdirp.sync(dir)
    unmutate = mutateFS.fail('mkdir', poop)
    cb()
  })
  t.afterEach(cb => {
    unmutate()
    cb()
  })

  const data = makeTar([
    {
      path: 'dir/',
      type: 'Directory',
      mode: 0o751,
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z'),
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    '',
    ''
  ])

  const expect = [ [
    'ENOENT: no such file or directory, lstat \'' +
    path.resolve(dir, 'dir') + '\'',
    {
      code: 'ENOENT',
      syscall: 'lstat',
      path: path.resolve(dir, 'dir')
    }
  ] ]

  const check = t => {
    t.match(warnings, expect)
    warnings.forEach(w => t.equal(w[0], w[1].message))
    t.end()
  }

  t.test('async', t => {
    new Unpack({
      cwd: dir,
      onwarn: (w, d) => warnings.push([w, d])
    }).on('close', _ => check(t)).end(data)
  })

  t.test('sync', t => {
    new UnpackSync({
      cwd: dir,
      onwarn: (w, d) => warnings.push([w, d])
    }).end(data)
    check(t)
  })

  t.end()
})

t.test('fail write', t => {
  const poop = new Error('poop')
  poop.code = 'EPOOP'
  const unmutate = mutateFS.fail('write', poop)
  const dir = path.join(unpackdir, 'write-fail')
  t.teardown(_ => (unmutate(), rimraf.sync(dir)))

  const warnings = []
  t.beforeEach(cb => {
    warnings.length = 0
    rimraf.sync(dir)
    mkdirp.sync(dir)
    cb()
  })

  const data = makeTar([
    {
      path: 'x',
      type: 'File',
      size: 1,
      mode: 0o751,
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    'x',
    '',
    ''
  ])

  const expect = [ [ 'poop', poop ] ]

  const check = t => {
    t.match(warnings, expect)
    warnings.forEach(w => t.equal(w[0], w[1].message))
    t.end()
  }

  t.test('async', t => {
    new Unpack({
      cwd: dir,
      onwarn: (w, d) => warnings.push([w, d])
    }).on('close', _ => check(t)).end(data)
  })

  t.test('sync', t => {
    new UnpackSync({
      cwd: dir,
      onwarn: (w, d) => warnings.push([w, d])
    }).end(data)
    check(t)
  })

  t.end()
})

t.test('skip existing', t => {
  const dir = path.join(unpackdir, 'skip-newer')
  t.teardown(_ => rimraf.sync(dir))

  const date = new Date('2011-03-27T22:16:31.000Z')
  t.beforeEach(cb => {
    rimraf.sync(dir)
    mkdirp.sync(dir)
    fs.writeFileSync(dir + '/x', 'y')
    fs.utimesSync(dir + '/x', date, date)
    cb()
  })

  const data = makeTar([
    {
      path: 'x',
      type: 'File',
      size: 1,
      mode: 0o751,
      mtime: new Date('2013-12-19T17:00:00.000Z')
    },
    'x',
    '',
    ''
  ])

  const check = t => {
    const st = fs.lstatSync(dir + '/x')
    t.equal(st.atime.toISOString(), date.toISOString())
    t.equal(st.mtime.toISOString(), date.toISOString())
    const data = fs.readFileSync(dir + '/x', 'utf8')
    t.equal(data, 'y')
    t.end()
  }

  t.test('async', t => {
    new Unpack({
      cwd: dir,
      keep: true
    }).on('close', _ => check(t)).end(data)
  })

  t.test('sync', t => {
    new UnpackSync({
      cwd: dir,
      keep: true
    }).end(data)
    check(t)
  })

  t.end()
})

t.test('skip newer', t => {
  const dir = path.join(unpackdir, 'skip-newer')
  t.teardown(_ => rimraf.sync(dir))

  const date = new Date('2013-12-19T17:00:00.000Z')
  t.beforeEach(cb => {
    rimraf.sync(dir)
    mkdirp.sync(dir)
    fs.writeFileSync(dir + '/x', 'y')
    fs.utimesSync(dir + '/x', date, date)
    cb()
  })

  const data = makeTar([
    {
      path: 'x',
      type: 'File',
      size: 1,
      mode: 0o751,
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    'x',
    '',
    ''
  ])

  const check = t => {
    const st = fs.lstatSync(dir + '/x')
    t.equal(st.atime.toISOString(), date.toISOString())
    t.equal(st.mtime.toISOString(), date.toISOString())
    const data = fs.readFileSync(dir + '/x', 'utf8')
    t.equal(data, 'y')
    t.end()
  }

  t.test('async', t => {
    new Unpack({
      cwd: dir,
      newer: true
    }).on('close', _ => check(t)).end(data)
  })

  t.test('sync', t => {
    new UnpackSync({
      cwd: dir,
      newer: true
    }).end(data)
    check(t)
  })

  t.end()
})

t.test('no mtime', t => {
  const dir = path.join(unpackdir, 'skip-newer')
  t.teardown(_ => rimraf.sync(dir))

  t.beforeEach(cb => {
    rimraf.sync(dir)
    mkdirp.sync(dir)
    cb()
  })

  const date = new Date('2011-03-27T22:16:31.000Z')
  const data = makeTar([
    {
      path: 'x/',
      type: 'Directory',
      size: 0,
      atime: date,
      ctime: date,
      mtime: date
    },
    {
      path: 'x/y',
      type: 'File',
      size: 1,
      mode: 0o751,
      atime: date,
      ctime: date,
      mtime: date
    },
    'x',
    '',
    ''
  ])

  const check = t => {
    // this may fail if it's run on March 27, 2011
    const stx = fs.lstatSync(dir + '/x')
    t.notEqual(stx.atime.toISOString(), date.toISOString())
    t.notEqual(stx.mtime.toISOString(), date.toISOString())
    const sty = fs.lstatSync(dir + '/x/y')
    t.notEqual(sty.atime.toISOString(), date.toISOString())
    t.notEqual(sty.mtime.toISOString(), date.toISOString())
    const data = fs.readFileSync(dir + '/x/y', 'utf8')
    t.equal(data, 'x')
    t.end()
  }

  t.test('async', t => {
    new Unpack({
      cwd: dir,
      noMtime: true
    }).on('close', _ => check(t)).end(data)
  })

  t.test('sync', t => {
    new UnpackSync({
      cwd: dir,
      noMtime: true
    }).end(data)
    check(t)
  })

  t.end()
})

t.test('unpack big enough to pause/drain', t => {
  const dir = path.resolve(unpackdir, 'drain-clog')
  mkdirp.sync(dir)
  t.tearDown(_ => rimraf.sync(dir))
  const stream = fs.createReadStream(fixtures + '/parses.tar')
  const u = new Unpack({
    cwd: dir,
    strip: 3,
    strict: true
  })

  u.on('ignoredEntry', entry =>
    t.fail('should not get ignored entry: ' + entry.path))

  u.on('close', _ => {
    t.pass('extraction finished')
    const actual = fs.readdirSync(dir)
    const expected = fs.readdirSync(parses)
    t.same(actual, expected)
    t.end()
  })

  stream.pipe(u)
})

t.test('set owner', t => {
  // fake it on platforms that don't have getuid
  const myUid = 501
  const myGid = 1024
  const getuid = process.getuid
  const getgid = process.getgid
  process.getuid = _ => myUid
  process.getgid = _ => myGid
  t.teardown(_ => (process.getuid = getuid, process.getgid = getgid))

  // can't actually do this because it requires root, but we can
  // verify that chown gets called.
  t.test('as root, defaults to true', t => {
    const getuid = process.getuid
    process.getuid = _ => 0
    const u = new Unpack()
    t.equal(u.preserveOwner, true, 'preserveOwner enabled')
    process.getuid = getuid
    t.end()
  })

  t.test('as non-root, defaults to false', t => {
    const getuid = process.getuid
    process.getuid = _ => 501
    const u = new Unpack()
    t.equal(u.preserveOwner, false, 'preserveOwner disabled')
    process.getuid = getuid
    t.end()
  })

  const data = makeTar([
    {
      uid: 2456124561,
      gid: 813708013,
      path: 'foo/',
      type: 'Directory'
    },
    {
      uid: myUid,
      gid: 813708013,
      path: 'foo/my-uid-different-gid',
      type: 'File',
      size: 3
    },
    'qux',
    {
      uid: 2456124561,
      path: 'foo/different-uid-nogid',
      type: 'Directory'
    },
    {
      uid: 2456124561,
      path: 'foo/different-uid-nogid/bar',
      type: 'File',
      size: 3
    },
    'qux',
    {
      gid: 813708013,
      path: 'foo/different-gid-nouid/bar',
      type: 'File',
      size: 3
    },
    'qux',
    {
      uid: myUid,
      gid: myGid,
      path: 'foo-mine/',
      type: 'Directory'
    },
    {
      uid: myUid,
      gid: myGid,
      path: 'foo-mine/bar',
      type: 'File',
      size: 3
    },
    'qux',
    {
      uid: myUid,
      path: 'foo-mine/nogid',
      type: 'Directory'
    },
    {
      uid: myUid,
      path: 'foo-mine/nogid/bar',
      type: 'File',
      size: 3
    },
    'qux',
    '',
    ''
  ])

  t.test('chown failure results in unpack failure', t => {
    const dir = path.resolve(unpackdir, 'chown')
    const poop = new Error('expected chown failure')
    const un = mutateFS.fail('chown', poop)
    const unl = mutateFS.fail('lchown', poop)
    const unf = mutateFS.fail('fchown', poop)

    t.teardown(_ => (un(), unf(), unl()))

    t.test('sync', t => {
      mkdirp.sync(dir)
      t.teardown(_ => rimraf.sync(dir))
      let warned = false
      const u = new Unpack.Sync({
        cwd: dir,
        preserveOwner: true,
        onwarn: (m, er) => {
          if (!warned) {
            warned = true
            t.equal(er, poop)
            t.end()
          }
        }
      })
      u.end(data)
    })

    t.test('async', t => {
      mkdirp.sync(dir)
      t.teardown(_ => rimraf.sync(dir))
      let warned = false
      const u = new Unpack({
        cwd: dir,
        preserveOwner: true,
        onwarn: (m, er) => {
          if (!warned) {
            warned = true
            t.equal(er, poop)
            t.end()
          }
        }
      })
      u.end(data)
    })

    t.test('cleanup', t => {
      rimraf.sync(dir)
      t.end()
    })

    t.end()
  })

  t.test('chown when true', t => {
    const dir = path.resolve(unpackdir, 'chown')
    const chown = fs.chown
    const chownSync = fs.chownSync
    const fchownSync = fs.fchownSync
    let called = 0
    fs.fchown = fs.chown = (path, owner, group, cb) => {
      called ++
      cb()
    }
    fs.chownSync = fs.fchownSync = _ => called++

    t.teardown(_ => {
      fs.chown = chown
      fs.chownSync = chownSync
      fs.fchownSync = fchownSync
    })

    t.test('sync', t => {
      mkdirp.sync(dir)
      t.teardown(_ => rimraf.sync(dir))
      called = 0
      const u = new Unpack.Sync({ cwd: dir, preserveOwner: true })
      u.end(data)
      t.ok(called >= 5, 'called chowns')
      t.end()
    })

    t.test('async', t => {
      mkdirp.sync(dir)
      t.teardown(_ => rimraf.sync(dir))
      called = 0
      const u = new Unpack({ cwd: dir, preserveOwner: true })
      u.end(data)
      u.on('close', _ => {
        t.ok(called >= 5, 'called chowns')
        t.end()
      })
    })

    t.end()
  })

  t.test('no chown when false', t => {
    const dir = path.resolve(unpackdir, 'nochown')
    const poop = new Error('poop')
    const un = mutateFS.fail('chown', poop)
    const unf = mutateFS.fail('fchown', poop)
    const unl = mutateFS.fail('lchown', poop)
    t.teardown(_ => {
      rimraf.sync(dir)
      un()
      unf()
      unl()
    })

    t.beforeEach(cb => mkdirp(dir, cb))
    t.afterEach(cb => rimraf(dir, cb))

    const check = t => {
      const dirStat = fs.statSync(dir + '/foo')
      t.notEqual(dirStat.uid, 2456124561)
      t.notEqual(dirStat.gid, 813708013)
      const fileStat = fs.statSync(dir + '/foo/my-uid-different-gid')
      t.notEqual(fileStat.uid, 2456124561)
      t.notEqual(fileStat.gid, 813708013)
      const dirStat2 = fs.statSync(dir + '/foo/different-uid-nogid')
      t.notEqual(dirStat2.uid, 2456124561)
      const fileStat2 = fs.statSync(dir + '/foo/different-uid-nogid/bar')
      t.notEqual(fileStat2.uid, 2456124561)
      t.end()
    }

    t.test('sync', t => {
      const u = new Unpack.Sync({ cwd: dir, preserveOwner: false })
      u.end(data)
      check(t)
    })

    t.test('async', t => {
      const u = new Unpack({ cwd: dir, preserveOwner: false })
      u.end(data)
      u.on('close', _ => check(t))
    })

    t.end()
  })

  t.end()
})

t.test('unpack when dir is not writable', t => {
  const data = makeTar([
    {
      path: 'a/',
      type: 'Directory',
      mode: 0o444
    },
    {
      path: 'a/b',
      type: 'File',
      size: 1
    },
    'a',
    '',
    ''
  ])

  const dir = path.resolve(unpackdir, 'nowrite-dir')
  t.beforeEach(cb => mkdirp(dir, cb))
  t.afterEach(cb => rimraf(dir, cb))

  const check = t => {
    t.equal(fs.statSync(dir + '/a').mode & 0o7777, 0o744)
    t.equal(fs.readFileSync(dir + '/a/b', 'utf8'), 'a')
    t.end()
  }

  t.test('sync', t => {
    const u = new Unpack.Sync({ cwd: dir, strict: true })
    u.end(data)
    check(t)
  })

  t.test('async', t => {
    const u = new Unpack({ cwd: dir, strict: true })
    u.end(data)
    u.on('close', _ => check(t))
  })

  t.end()
})

t.test('transmute chars on windows', t => {
  const data = makeTar([
    {
      path: '<|>?:.txt',
      size: 5,
      type: 'File'
    },
    '<|>?:',
    '',
    ''
  ])

  const dir = path.resolve(unpackdir, 'winchars')
  t.beforeEach(cb => mkdirp(dir, cb))
  t.afterEach(cb => rimraf(dir, cb))

  const hex = 'ef80bcef81bcef80beef80bfef80ba2e747874'
  const uglyName = Buffer.from(hex, 'hex').toString()
  const ugly = path.resolve(dir, uglyName)

  const check = t => {
    t.same(fs.readdirSync(dir), [ uglyName ])
    t.equal(fs.readFileSync(ugly, 'utf8'), '<|>?:')
    t.end()
  }

  t.test('async', t => {
    const u = new Unpack({
      cwd: dir,
      win32: true
    })
    u.end(data)
    u.on('close', _ => check(t))
  })

  t.test('sync', t => {
    const u = new Unpack.Sync({
      cwd: dir,
      win32: true
    })
    u.end(data)
    check(t)
  })

  t.end()
})

t.test('safely transmute chars on windows with absolutes', t => {
  // don't actually make the directory
  const poop = new Error('poop')
  t.teardown(mutateFS.fail('mkdir', poop))

  const data = makeTar([
    {
      path: 'c:/x/y/z/<|>?:.txt',
      size: 5,
      type: 'File'
    },
    '<|>?:',
    '',
    ''
  ])

  const hex = 'ef80bcef81bcef80beef80bfef80ba2e747874'
  const uglyName = Buffer.from(hex, 'hex').toString()
  const uglyPath = 'c:/x/y/z/' + uglyName

  const u = new Unpack({
    win32: true,
    preservePaths: true
  })
  u.on('entry', entry => {
    t.equal(entry.path, uglyPath)
    t.end()
  })

  u.end(data)
})

t.test('use explicit chmod when required by umask', t => {
  process.umask(0o022)

  const basedir = path.resolve(unpackdir, 'umask-chmod')

  const data = makeTar([
    {
      path: 'x/y/z',
      mode: 0o775,
      type: 'Directory'
    },
    '',
    ''
  ])

  const check = t => {
    const st = fs.statSync(basedir + '/x/y/z')
    t.equal(st.mode & 0o777, 0o775)
    rimraf.sync(basedir)
    t.end()
  }

  t.test('async', t => {
    mkdirp.sync(basedir)
    const unpack = new Unpack({ cwd: basedir })
    unpack.on('close', _ => check(t))
    unpack.end(data)
  })

  return t.test('sync', t => {
    mkdirp.sync(basedir)
    const unpack = new Unpack.Sync({ cwd: basedir })
    unpack.end(data)
    check(t)
  })
})

t.test('chown implicit dirs and also the entries', t => {
  const basedir = path.resolve(unpackdir, 'chownr')

  // club these so that the test can run as non-root
  const chown = fs.chown
  const chownSync = fs.chownSync
  const lchown = fs.lchown
  const lchownSync = fs.lchownSync
  const fchown = fs.fchown
  const fchownSync = fs.fchownSync

  const getuid = process.getuid
  const getgid = process.getgid
  t.teardown(_ => {
    fs.chown = chown
    fs.chownSync = chownSync
    fs.lchown = lchown
    fs.lchownSync = lchownSync
    fs.fchown = fchown
    fs.fchownSync = fchownSync
    process.getgid = getgid
  })

  let chowns = 0

  let currentTest = null
  fs.fchown = fs.chown = (path, uid, gid, cb) => {
    currentTest.equal(uid, 420, 'chown(' + path + ') uid')
    currentTest.equal(gid, 666, 'chown(' + path + ') gid')
    chowns ++
    cb()
  }
  if (fs.lchown)
    fs.lchown = fs.fchown

  fs.chownSync = fs.fchownSync = (path, uid, gid) => {
    currentTest.equal(uid, 420, 'chownSync(' + path + ') uid')
    currentTest.equal(gid, 666, 'chownSync(' + path + ') gid')
    chowns ++
  }
  if (fs.lchownSync)
    fs.lchownSync = fs.fchownSync

  const data = makeTar([
    {
      path: 'a/b/c',
      mode: 0o775,
      type: 'File',
      size: 1,
      uid: null,
      gid: null
    },
    '.',
    {
      path: 'x/y/z',
      mode: 0o775,
      uid: 12345,
      gid: 54321,
      type: 'File',
      size: 1
    },
    '.',
    '',
    ''
  ])

  const check = t => {
    currentTest = null
    t.equal(chowns, 8)
    chowns = 0
    rimraf.sync(basedir)
    t.end()
  }

  t.test('throws when setting uid/gid improperly', t => {
    t.throws(_ => new Unpack({ uid: 420 }),
      TypeError('cannot set owner without number uid and gid'))
    t.throws(_ => new Unpack({ gid: 666 }),
      TypeError('cannot set owner without number uid and gid'))
    t.throws(_ => new Unpack({ uid: 1, gid: 2, preserveOwner: true }),
      TypeError('cannot preserve owner in archive and also set owner explicitly'))
    t.end()
  })

  const tests = () =>
    t.test('async', t => {
      currentTest = t
      mkdirp.sync(basedir)
      const unpack = new Unpack({ cwd: basedir, uid: 420, gid: 666 })
      unpack.on('close', _ => check(t))
      unpack.end(data)
    }).then(t.test('sync', t => {
      currentTest = t
      mkdirp.sync(basedir)
      const unpack = new Unpack.Sync({ cwd: basedir, uid: 420, gid: 666 })
      unpack.end(data)
      check(t)
    }))

  tests()

  t.test('make it look like processUid is 420', t => {
    process.getuid = () => 420
    t.end()
  })

  tests()

  t.test('make it look like processGid is 666', t => {
    process.getuid = getuid
    process.getgid = () => 666
    t.end()
  })

  return tests()
})

t.test('bad cwd setting', t => {
  const basedir = path.resolve(unpackdir, 'bad-cwd')
  mkdirp.sync(basedir)
  t.teardown(_ => rimraf.sync(basedir))

  const cases = [
    // the cwd itself
    {
      path: './',
      type: 'Directory'
    },
    // a file directly in the cwd
    {
      path: 'a',
      type: 'File'
    },
    // a file nested within a subdir of the cwd
    {
      path: 'a/b/c',
      type: 'File'
    }
  ]

  fs.writeFileSync(basedir + '/file', 'xyz')

  cases.forEach(c => t.test(c.type + ' ' + c.path, t => {
    const data = makeTar([
      {
        path: c.path,
        mode: 0o775,
        type: c.type,
        size: 0,
        uid: null,
        gid: null
      },
      '',
      ''
    ])

    t.test('cwd is a file', t => {
      const cwd = basedir + '/file'
      const opt = { cwd: cwd }

      t.throws(_ => new Unpack.Sync(opt).end(data), {
        name: 'CwdError',
        message: 'ENOTDIR: Cannot cd into \'' + cwd + '\'',
        path: cwd,
        code: 'ENOTDIR'
      })

      new Unpack(opt).on('error', er => {
        t.match(er, {
          name: 'CwdError',
          message: 'ENOTDIR: Cannot cd into \'' + cwd + '\'',
          path: cwd,
          code: 'ENOTDIR'
        })
        t.end()
      }).end(data)
    })

    return t.test('cwd is missing', t => {
      const cwd = basedir + '/asdf/asdf/asdf'
      const opt = { cwd: cwd }

      t.throws(_ => new Unpack.Sync(opt).end(data), {
        name: 'CwdError',
        message: 'ENOENT: Cannot cd into \'' + cwd + '\'',
        path: cwd,
        code: 'ENOENT'
      })

      new Unpack(opt).on('error', er => {
        t.match(er, {
          name: 'CwdError',
          message: 'ENOENT: Cannot cd into \'' + cwd + '\'',
          path: cwd,
          code: 'ENOENT'
        })
        t.end()
      }).end(data)
    })
  }))

  t.end()
})

t.test('transform', t => {
  const basedir = path.resolve(unpackdir, 'transform')
  t.teardown(_ => rimraf.sync(basedir))

  const cases = {
    'emptypax.tar': {
      '🌟.txt': '🌟✧✩⭐︎✪✫✬✭✮⚝✯✰✵✶✷✸✹❂⭑⭒★☆✡☪✴︎✦✡️🔯✴️🌠\n',
      'one-byte.txt': '[a]'
    },
    'body-byte-counts.tar': {
      '1024-bytes.txt': new Array(1024).join('[x]') + '[\n]',
      '512-bytes.txt': new Array(512).join('[x]') + '[\n]',
      'one-byte.txt': '[a]',
      'zero-byte.txt': ''
    },
    'utf8.tar': {
      '🌟.txt': '🌟✧✩⭐︎✪✫✬✭✮⚝✯✰✵✶✷✸✹❂⭑⭒★☆✡☪✴︎✦✡️🔯✴️🌠\n',
      'Ω.txt': '[Ω]',
      'long-path/r/e/a/l/l/y/-/d/e/e/p/-/f/o/l/d/e/r/-/p/a/t/h/Ω.txt': '[Ω]'
    }
  }

  const txFn = entry => {
    switch (path.basename(entry.path)) {
      case 'zero-bytes.txt':
        return entry

      case 'one-byte.txt':
      case '1024-bytes.txt':
      case '512-bytes.txt':
      case 'Ω.txt':
        return new Bracer()
    }
  }

  class Bracer extends MiniPass {
    write (data) {
      const d = data.toString().split('').map(c => '[' + c + ']').join('')
      return super.write(d)
    }
  }

  const tarfiles = Object.keys(cases)
  t.plan(tarfiles.length)
  t.jobs = tarfiles.length

  tarfiles.forEach(tarfile => {
    t.test(tarfile, t => {
      const tf = path.resolve(tars, tarfile)
      const dir = path.resolve(basedir, tarfile)
      t.beforeEach(cb => {
        rimraf.sync(dir)
        mkdirp.sync(dir)
        cb()
      })

      const check = t => {
        const expect = cases[tarfile]
        Object.keys(expect).forEach(file => {
          const f = path.resolve(dir, file)
          t.equal(fs.readFileSync(f, 'utf8'), expect[file], file)
        })
        t.end()
      }

      t.plan(2)

      t.test('async unpack', t => {
        t.plan(2)
        t.test('strict', t => {
          const unpack = new Unpack({ cwd: dir, strict: true, transform: txFn })
          fs.createReadStream(tf).pipe(unpack)
          eos(unpack, _ => check(t))
        })
        t.test('loose', t => {
          const unpack = new Unpack({ cwd: dir, transform: txFn })
          fs.createReadStream(tf).pipe(unpack)
          eos(unpack, _ => check(t))
        })
      })

      t.test('sync unpack', t => {
        t.plan(2)
        t.test('strict', t => {
          const unpack = new UnpackSync({ cwd: dir, strict: true, transform: txFn })
          unpack.end(fs.readFileSync(tf))
          check(t)
        })
        t.test('loose', t => {
          const unpack = new UnpackSync({ cwd: dir, transform: txFn })
          unpack.end(fs.readFileSync(tf))
          check(t)
        })
      })
    })
  })
})

t.test('transform error', t => {
  const dir = path.resolve(unpackdir, 'transform-error')
  mkdirp.sync(dir)
  // The async transform-error subtests abandon their writes mid-flight, so
  // stray files can still land in dir just after the subtests resolve. A
  // single rimraf.sync races them and dies with ENOTEMPTY on slower Node
  // versions, so retry a bounded number of times, only rethrowing on the
  // final attempt. Synchronous on purpose: this file must parse on Node 4.
  t.teardown(_ => {
    var attempts = 10
    for (var i = 0; i < attempts; i++) {
      try {
        rimraf.sync(dir)
        return
      } catch (er) {
        if (i === attempts - 1)
          throw er
        // busy-wait briefly to let the abandoned writes settle
        var until = Date.now() + 100
        while (Date.now() < until) {}
      }
    }
  })

  const tarfile = path.resolve(tars, 'body-byte-counts.tar')
  const tardata = fs.readFileSync(tarfile)
  const poop = new Error('poop')

  const txFn = () => {
    const tx = new MiniPass()
    tx.write = () => tx.emit('error', poop)
    tx.resume()
    return tx
  }

  t.test('sync unpack', t => {
    t.test('strict', t => {
      const unpack = new UnpackSync({ cwd: dir, strict: true, transform: txFn })
      const expect = 3
      let actual = 0
      unpack.on('error', er => {
        t.equal(er, poop)
        actual ++
      })
      unpack.end(tardata)
      t.equal(actual, expect, 'error count')
      t.end()
    })
    t.test('loose', t => {
      const unpack = new UnpackSync({ cwd: dir, transform: txFn })
      const expect = 3
      let actual = 0
      unpack.on('warn', (msg, er) => {
        t.equal(er, poop)
        actual ++
      })
      unpack.end(tardata)
      t.equal(actual, expect, 'error count')
      t.end()
    })
    t.end()
  })
  t.test('async unpack', t => {
    // the last error is about the folder being deleted, just ignore that one
    t.test('strict', t => {
      const unpack = new Unpack({ cwd: dir, strict: true, transform: txFn })
      t.plan(3)
      t.teardown(() => {
        unpack.removeAllListeners('error')
        unpack.on('error', () => {})
      })
      unpack.on('error', er => t.equal(er, poop))
      unpack.end(tardata)
    })
    t.test('loose', t => {
      const unpack = new Unpack({ cwd: dir, transform: txFn })
      t.plan(3)
      t.teardown(() => unpack.removeAllListeners('warn'))
      unpack.on('warn', (msg, er) => t.equal(er, poop))
      unpack.end(tardata)
    })
    t.end()
  })

  t.end()
})

t.test('futimes/fchown failures', t => {
  const archive = path.resolve(tars, 'utf8.tar')
  const dir = path.resolve(unpackdir, 'futimes-fchown-fails')
  const tardata = fs.readFileSync(archive)

  const poop = new Error('poop')
  const second = new Error('second error')

  const reset = cb => {
    rimraf.sync(dir)
    mkdirp.sync(dir)
  }

  reset()
  t.teardown(() => rimraf.sync(dir))

  const methods = ['utimes', 'chown']
  methods.forEach(method => {
    const fc = method === 'chown'
    t.test(method +' fallback', t => {
      t.teardown(mutateFS.fail('f' + method, poop))
      // forceChown will fail on systems where the user is not root
      // and/or the uid/gid in the archive aren't valid. We're just
      // verifying coverage here, so make the method auto-pass.
      t.teardown(mutateFS.pass(method))
      t.plan(2)
      t.test('async unpack', t => {
        t.plan(2)
        t.test('strict', t => {
          reset()
          const unpack = new Unpack({ cwd: dir, strict: true, forceChown: fc })
          unpack.on('finish', t.end)
          unpack.end(tardata)
        })
        t.test('loose', t => {
          reset()
          const unpack = new Unpack({ cwd: dir, forceChown: fc })
          unpack.on('finish', t.end)
          unpack.on('warn', t.fail)
          unpack.end(tardata)
        })
      })
      t.test('sync unpack', t => {
        t.plan(2)
        t.test('strict', t => {
          reset()
          const unpack = new Unpack.Sync({ cwd: dir, strict: true, forceChown: fc })
          unpack.end(tardata)
          t.end()
        })
        t.test('loose', t => {
          reset()
          const unpack = new Unpack.Sync({ cwd: dir, forceChown: fc })
          unpack.on('warn', t.fail)
          unpack.end(tardata)
          t.end()
        })
      })
    })

    t.test('also fail ' + method, t => {
      const unmutate = mutateFS.fail('f' + method, poop)
      const unmutate2 = mutateFS.fail(method, second)
      t.teardown(() => {
        unmutate()
        unmutate2()
      })
      t.plan(2)
      t.test('async unpack', t => {
        t.plan(2)
        t.test('strict', t => {
          reset()
          const unpack = new Unpack({ cwd: dir, strict: true, forceChown: fc })
          t.plan(3)
          unpack.on('error', er => t.equal(er, poop))
          unpack.end(tardata)
        })
        t.test('loose', t => {
          reset()
          const unpack = new Unpack({ cwd: dir, forceChown: fc })
          t.plan(3)
          unpack.on('warn', (m, er) => t.equal(er, poop))
          unpack.end(tardata)
        })
      })
      t.test('sync unpack', t => {
        t.plan(2)
        t.test('strict', t => {
          reset()
          const unpack = new Unpack.Sync({ cwd: dir, strict: true, forceChown: fc })
          t.plan(3)
          unpack.on('error', er => t.equal(er, poop))
          unpack.end(tardata)
        })
        t.test('loose', t => {
          reset()
          const unpack = new Unpack.Sync({ cwd: dir, forceChown: fc })
          t.plan(3)
          unpack.on('warn', (m, er) => t.equal(er, poop))
          unpack.end(tardata)
        })
      })
    })
  })

  t.end()
})

t.test('onentry option is preserved', t => {
  const basedir = path.resolve(unpackdir, 'onentry-method')
  mkdirp.sync(basedir)
  t.teardown(() => rimraf.sync(basedir))

  let oecalls = 0
  const onentry = entry => oecalls++
  const data = makeTar([
    {
      path: 'd/i',
      type: 'Directory'
    },
    {
      path: 'd/i/r/dir',
      type: 'Directory',
      mode: 0o751,
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    {
      path: 'd/i/r/file',
      type: 'File',
      size: 1,
      atime: new Date('1979-07-01T19:10:00.000Z'),
      ctime: new Date('2011-03-27T22:16:31.000Z')
    },
    'a',
    '',
    ''
  ])

  const check = t => {
    t.equal(oecalls, 3)
    oecalls = 0
    t.end()
  }

  t.test('sync', t => {
    const dir = path.join(basedir, 'sync')
    mkdirp.sync(dir)
    const unpack = new UnpackSync({ cwd: dir, onentry })
    unpack.end(data)
    check(t)
  })

  t.test('async', t => {
    const dir = path.join(basedir, 'async')
    mkdirp.sync(dir)
    const unpack = new Unpack({ cwd: dir, onentry })
    unpack.on('finish', () => check(t))
    unpack.end(data)
  })

  t.end()
})

t.test('do not reuse hardlinks, only nlink=1 files', t => {
  const basedir = path.resolve(unpackdir, 'hardlink-reuse')
  mkdirp.sync(basedir)
  t.teardown(() => rimraf.sync(basedir))

  const now = new Date('2018-04-30T18:30:39.025Z')

  const data = makeTar([
    {
      path: 'overwriteme',
      type: 'File',
      size: 4,
      mode: 0o644,
      mtime: now
    },
    'foo\n',
    {
      path: 'link',
      linkpath: 'overwriteme',
      type: 'Link',
      mode: 0o644,
      mtime: now
    },
    {
      path: 'link',
      type: 'File',
      size: 4,
      mode: 0o644,
      mtime: now
    },
    'bar\n',
    '',
    ''
  ])

  const checks = {
    'link': 'bar\n',
    'overwriteme': 'foo\n'
  }

  const check = t => {
    for (let f in checks) {
      t.equal(fs.readFileSync(basedir + '/' + f, 'utf8'), checks[f], f)
      t.equal(fs.statSync(basedir + '/' + f).nlink, 1, f)
    }
    t.end()
  }

  t.test('async', t => {
    const u = new Unpack({ cwd: basedir })
    u.on('close', () => check(t))
    u.end(data)
  })

  t.test('sync', t => {
    const u = new UnpackSync({ cwd: basedir })
    u.end(data)
    check(t)
  })

  t.end()
})

t.test('drop entry from dirCache if no longer a directory', t => {
  const dir = path.resolve(unpackdir, 'dir-cache-error')
  mkdirp.sync(dir + '/sync/y')
  mkdirp.sync(dir + '/async/y')
  const data = makeTar([
    {
      path: 'x',
      type: 'Directory'
    },
    {
      path: 'x',
      type: 'SymbolicLink',
      linkpath: './y'
    },
    {
      path: 'x/ginkoid',
      type: 'File',
      size: 'ginkoid'.length
    },
    'ginkoid',
    '',
    ''
  ])
  t.plan(2)
  const WARNINGS = {}
  const check = (t, path) => {
    t.equal(fs.statSync(path + '/x').isDirectory(), true)
    t.equal(fs.lstatSync(path + '/x').isSymbolicLink(), true)
    t.equal(fs.statSync(path + '/y').isDirectory(), true)
    t.strictSame(fs.readdirSync(path + '/y'), [])
    t.throws(_ => fs.readFileSync(path + '/x/ginkoid'), { code: 'ENOENT' })
    t.strictSame(WARNINGS[path], [
      'Cannot extract through symbolic link'
    ])
    t.end()
  }
  t.test('async', t => {
    const path = dir + '/async'
    new Unpack({ cwd: path })
      .on('warn', msg => WARNINGS[path] = [msg])
      .on('end', () => check(t, path))
      .end(data)
  })
  t.test('sync', t => {
    const path = dir + '/sync'
    new UnpackSync({ cwd: path })
      .on('warn', msg => WARNINGS[path] = [msg])
      .end(data)
    check(t, path)
  })
})

// CVE-2021-37701: the dirCache purge used to be a byte-exact string
// comparison, so a symlink entry whose name differed from a previously
// cached directory only by letter case (or by directory separator) left
// the stale directory in the cache.  On a case-insensitive filesystem the
// symlink then aliased that directory, and the next entry underneath it
// took the cache hit, skipped the symlink check in mkdir, and was written
// straight through the link -- an arbitrary file write.
//
// A case-insensitive filesystem cannot be simulated on the Linux CI
// filesystem, so assert the pruning itself: after the differently-cased
// symlink entry, neither the stale directory nor any of its children may
// remain in the dirCache.
t.test('prune dirCache case-insensitively', t => {
  const dir = path.resolve(unpackdir, 'prune-cache-case')
  mkdirp.sync(dir + '/sync')
  mkdirp.sync(dir + '/async')
  const data = makeTar([
    {
      path: 'Y',
      type: 'Directory'
    },
    {
      path: 'Y/child',
      type: 'Directory'
    },
    {
      path: 'y',
      type: 'SymbolicLink',
      linkpath: './z'
    },
    '',
    ''
  ])

  const check = (t, cwd, dirCache) => {
    // the differently-cased directory, and everything under it, must be
    // gone from the cache once the symlink took its place.
    t.equal(dirCache.has(cwd + '/Y'), false, 'stale dir pruned')
    t.equal(dirCache.has(cwd + '/Y/child'), false, 'stale child pruned')
    // the extraction root itself is not a prefix match, so it survives.
    t.equal(dirCache.get(cwd), true, 'cwd left in cache')
    t.end()
  }

  t.plan(2)

  t.test('async', t => {
    const cwd = dir + '/async'
    const dirCache = new Map()
    new Unpack({ cwd: cwd, dirCache: dirCache })
      .on('warn', _ => _)
      .on('end', () => check(t, cwd, dirCache))
      .end(data)
  })

  t.test('sync', t => {
    const cwd = dir + '/sync'
    const dirCache = new Map()
    new UnpackSync({ cwd: cwd, dirCache: dirCache })
      .on('warn', _ => _)
      .end(data)
    check(t, cwd, dirCache)
  })
})

t.test('dirCache pruning unicode normalized collisions', {
  skip: isWindows && 'symlinks not fully supported',
}, t => {
  const data = makeTar([
    {
      type: 'Directory',
      path: 'foo',
    },
    {
      type: 'File',
      path: 'foo/bar',
      size: 1,
    },
    'x',
    {
      type: 'Directory',
      // café
      path: Buffer.from([0x63, 0x61, 0x66, 0xc3, 0xa9]).toString(),
    },
    {
      type: 'SymbolicLink',
      // cafe with a `
      path: Buffer.from([0x63, 0x61, 0x66, 0x65, 0xcc, 0x81]).toString(),
      linkpath: 'foo',
    },
    {
      type: 'File',
      path: Buffer.from([0x63, 0x61, 0x66, 0xc3, 0xa9]).toString() + '/bar',
      size: 1,
    },
    'y',
    '',
    '',
  ])

  const check = (path, dirCache, t) => {
    path = path.replace(/\\/g, '/')
    // The unicode-colliding directory did not survive the symlink entry in
    // the cache, so the trailing file could not take a stale cache hit and
    // get written straight through the link.  It is legitimately back in
    // the cache here, re-added by the lstat-verified mkdir that the file
    // entry had to perform once the stale entry was gone.
    const cafeNFC = Buffer.from([0x63, 0x61, 0x66, 0xc3, 0xa9]).toString()
    t.strictSame(cacheEntries(dirCache), [
      [path, true],
      [`${path}/${cafeNFC}`, true],
      [`${path}/foo`, true],
    ].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    t.equal(fs.readFileSync(path + '/foo/bar', 'utf8'), 'x')
    t.end()
  }

  t.test('sync', t => {
    const path = testdir()
    const dirCache = new Map()
    new UnpackSync({ cwd: path, dirCache: dirCache })
      .on('warn', _ => _)
      .end(data)
    check(path, dirCache, t)
  })
  t.test('async', t => {
    const path = testdir()
    const dirCache = new Map()
    new Unpack({ cwd: path, dirCache: dirCache })
      .on('warn', _ => _)
      .on('close', () => check(path, dirCache, t))
      .end(data)
  })

  t.end()
})

// CVE-2021-37712: pruneCache used to compare cache keys byte-exactly (after
// lowercasing), so a directory cached under its NFC form ('café') was
// left in the dirCache by a symlink entry named with the NFD form
// ('café').  On a unicode-squashing filesystem the symlink then aliased
// that directory, and any entry beneath it took the cache hit, skipped the
// symlink check in mkdir, and was written straight through the link.
//
// A unicode-squashing filesystem cannot be simulated on the Linux CI
// filesystem, so assert the pruning itself: after the differently-normalized
// symlink entry, neither the stale directory nor any of its children may
// remain in the dirCache.
t.test('prune dirCache on unicode normalization collision', {
  skip: isWindows && 'symlinks not fully supported',
}, t => {
  // café, precomposed (NFC)
  const cafeNFC = Buffer.from([0x63, 0x61, 0x66, 0xc3, 0xa9]).toString()
  // cafe + combining acute accent (NFD)
  const cafeNFD = Buffer.from([0x63, 0x61, 0x66, 0x65, 0xcc, 0x81]).toString()

  const dir = path.resolve(unpackdir, 'prune-cache-unicode')
  mkdirp.sync(dir + '/sync')
  mkdirp.sync(dir + '/async')

  const data = makeTar([
    {
      path: cafeNFC,
      type: 'Directory'
    },
    {
      path: cafeNFC + '/child',
      type: 'Directory'
    },
    {
      path: cafeNFD,
      type: 'SymbolicLink',
      linkpath: './z'
    },
    '',
    ''
  ])

  const check = (t, cwd, dirCache) => {
    t.equal(dirCache.has(cwd + '/' + cafeNFC), false,
      'stale unicode-colliding dir pruned')
    t.equal(dirCache.has(cwd + '/' + cafeNFC + '/child'), false,
      'stale unicode-colliding child pruned')
    // the extraction root itself is not a collision, so it survives.
    t.equal(dirCache.get(cwd), true, 'cwd left in cache')
    t.end()
  }

  t.plan(2)

  t.test('async', t => {
    const cwd = dir + '/async'
    const dirCache = new Map()
    new Unpack({ cwd: cwd, dirCache: dirCache })
      .on('warn', _ => _)
      .on('end', () => check(t, cwd, dirCache))
      .end(data)
  })

  t.test('sync', t => {
    const cwd = dir + '/sync'
    const dirCache = new Map()
    new UnpackSync({ cwd: cwd, dirCache: dirCache })
      .on('warn', _ => _)
      .end(data)
    check(t, cwd, dirCache)
  })
})

// CVE-2021-37712: a dirCache key carrying trailing slashes AND a different
// unicode normalization from the colliding symlink's entry.absolute matched
// neither the exact-key nor the prefix branch of the old prune, so it
// survived and aliased the link for every entry underneath it.  The fix
// strips trailing slashes and NFKD-normalizes both sides of the comparison.
t.test('prune dirCache on trailing-slash + unicode collision', {
  skip: isWindows && 'symlinks not fully supported',
}, t => {
  // café, precomposed (NFC) -- what the directory got cached as
  const cafeNFC = Buffer.from([0x63, 0x61, 0x66, 0xc3, 0xa9]).toString()
  // cafe + combining acute accent (NFD) -- what the symlink entry is named
  const cafeNFD = Buffer.from([0x63, 0x61, 0x66, 0x65, 0xcc, 0x81]).toString()

  const dir = path.resolve(unpackdir, 'prune-cache-slash')
  mkdirp.sync(dir + '/sync')
  mkdirp.sync(dir + '/async')

  const data = makeTar([
    {
      path: cafeNFD,
      type: 'SymbolicLink',
      linkpath: './z'
    },
    '',
    ''
  ])

  const check = (t, cwd, dirCache) => {
    t.equal(dirCache.has(cwd + '/' + cafeNFC + '/'), false,
      'trailing-slash colliding key pruned')
    t.equal(dirCache.has(cwd + '/' + cafeNFC + '/child/'), false,
      'trailing-slash colliding child key pruned')
    t.equal(dirCache.get(cwd), true, 'cwd left in cache')
    t.end()
  }

  const seed = cwd => {
    const dirCache = new Map()
    dirCache.set(cwd, true)
    dirCache.set(cwd + '/' + cafeNFC + '/', true)
    dirCache.set(cwd + '/' + cafeNFC + '/child/', true)
    return dirCache
  }

  t.plan(2)

  t.test('async', t => {
    const cwd = dir + '/async'
    const dirCache = seed(cwd)
    new Unpack({ cwd: cwd, dirCache: dirCache })
      .on('warn', _ => _)
      .on('end', () => check(t, cwd, dirCache))
      .end(data)
  })

  t.test('sync', t => {
    const cwd = dir + '/sync'
    const dirCache = seed(cwd)
    new UnpackSync({ cwd: cwd, dirCache: dirCache })
      .on('warn', _ => _)
      .end(data)
    check(t, cwd, dirCache)
  })
})

t.test('dircache prune all on windows when symlink encountered', t => {
  if (process.platform !== 'win32') {
    process.env.TESTING_TAR_FAKE_PLATFORM = 'win32'
    t.teardown(() => {
      delete process.env.TESTING_TAR_FAKE_PLATFORM
    })
  }
  const symlinks = []
  // Object.assign rather than object spread -- node 4/6 in the support
  // matrix cannot parse `{ ...fs }`.
  const WinUnpack = requireInject('../lib/unpack.js', {
    fs: Object.assign({}, fs, {
      symlink: (target, dest, cb) => {
        symlinks.push(['async', target, dest])
        process.nextTick(cb)
      },
      symlinkSync: (target, dest) => symlinks.push(['sync', target, dest]),
    }),
  })
  const WinUnpackSync = WinUnpack.Sync

  const data = makeTar([
    {
      type: 'Directory',
      path: 'foo',
    },
    {
      type: 'File',
      path: 'foo/bar',
      size: 1,
    },
    'x',
    {
      type: 'Directory',
      // café
      path: Buffer.from([0x63, 0x61, 0x66, 0xc3, 0xa9]).toString(),
    },
    {
      type: 'SymbolicLink',
      // cafe with a `
      path: Buffer.from([0x63, 0x61, 0x66, 0x65, 0xcc, 0x81]).toString(),
      linkpath: 'safe/actually/but/cannot/be/too/careful',
    },
    {
      type: 'File',
      path: 'bar/baz',
      size: 1,
    },
    'z',
    '',
    '',
  ])

  const check = (path, dirCache, t) => {
    // symlink blew away all dirCache entries before it
    path = path.replace(/\\/g, '/')
    t.strictSame(cacheEntries(dirCache), [
      [`${path}`, true],
      [`${path}/bar`, true],
    ].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    t.equal(fs.readFileSync(`${path}/foo/bar`, 'utf8'), 'x')
    t.equal(fs.readFileSync(`${path}/bar/baz`, 'utf8'), 'z')
    t.end()
  }

  t.test('sync', t => {
    const path = testdir()
    const dirCache = new Map()
    new WinUnpackSync({ cwd: path, dirCache: dirCache })
      .on('warn', _ => _)
      .end(data)
    check(path, dirCache, t)
  })

  t.test('async', t => {
    const path = testdir()
    const dirCache = new Map()
    new WinUnpack({ cwd: path, dirCache: dirCache })
      .on('warn', _ => _)
      .on('close', () => check(path, dirCache, t))
      .end(data)
  })

  t.end()
})

t.test('excessively deep subfolder nesting', t => {
  const tf = path.resolve(fixtures, 'excessively-deep.tar')
  const data = fs.readFileSync(tf)
  const warnings = []
  const onwarn = (w, d) => warnings.push([w, d])

  const check = (t, cwd, maxDepth) => {
    maxDepth = maxDepth || 1024
    t.equal(warnings.length, 1, 'got exactly one warning')
    t.equal(warnings[0][0], 'path excessively deep')
    const d = warnings[0][1]
    t.ok(d.entry instanceof ReadEntry, 'warning carries the skipped entry')
    t.match(d.path, /^\.(\/a){1024,}\/foo\.txt$/)
    t.equal(d.depth, 222372)
    t.equal(d.maxDepth, maxDepth)
    // the entry was skipped, so nothing at all landed in the cwd
    t.same(fs.readdirSync(cwd), [], 'nothing extracted')
    warnings.length = 0
    t.end()
  }

  t.test('async', t => {
    const cwd = testdir()
    new Unpack({
      cwd: cwd,
      onwarn: onwarn
    }).on('end', () => check(t, cwd)).end(data)
  })

  t.test('sync', t => {
    const cwd = testdir()
    new UnpackSync({
      cwd: cwd,
      onwarn: onwarn
    }).end(data)
    check(t, cwd)
  })

  t.test('async set md', t => {
    const cwd = testdir()
    new Unpack({
      cwd: cwd,
      onwarn: onwarn,
      maxDepth: 64
    }).on('end', () => check(t, cwd, 64)).end(data)
  })

  t.test('sync set md', t => {
    const cwd = testdir()
    new UnpackSync({
      cwd: cwd,
      onwarn: onwarn,
      maxDepth: 64
    }).end(data)
    check(t, cwd, 64)
  })

  t.test('maxDepth:Infinity disables the check', t => {
    const cwd = testdir()
    const shallow = makeTar([
      {
        path: 'a/b/c.txt',
        type: 'File',
        size: 1
      },
      'x',
      '',
      ''
    ])
    new UnpackSync({
      cwd: cwd,
      onwarn: onwarn,
      maxDepth: Infinity
    }).end(shallow)
    t.equal(warnings.length, 0, 'no warnings')
    t.equal(fs.readFileSync(path.resolve(cwd, 'a/b/c.txt'), 'utf8'), 'x')
    t.end()
  })

  t.end()
})

t.test('GHSA-8qq5-rm4j-mr97 linkpath sanitization', t => {
  const tarWithLink = (p, type, lp) => makeTar([
    {
      path: p,
      type: type,
      linkpath: lp,
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    '',
    ''
  ])

  // an absolute symlink linkpath is written to disk verbatim, so it hands the
  // archive a symlink to anywhere on the filesystem.  The root is stripped,
  // exactly like an absolute entry.path is.
  t.test('strip root of absolute symlink linkpath', t => {
    const lp = '/some/absolute/path'
    const data = tarWithLink('sym', 'SymbolicLink', lp)
    const warnings = []

    const check = (t, cwd) => {
      t.same(warnings, [[
        'stripping / from absolute linkpath',
        lp
      ]], 'warned about stripping the linkpath root')
      const sym = path.resolve(cwd, 'sym')
      t.ok(fs.lstatSync(sym).isSymbolicLink(), 'is symlink')
      t.equal(fs.readlinkSync(sym), 'some/absolute/path',
        'linkpath is no longer absolute')
      t.end()
    }

    t.test('async', t => {
      const cwd = testdir()
      warnings.length = 0
      new Unpack({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).on('close', _ => check(t, cwd)).end(data)
    })

    t.test('sync', t => {
      const cwd = testdir()
      warnings.length = 0
      new UnpackSync({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).end(data)
      check(t, cwd)
    })

    t.end()
  })

  // hard link linkpaths are resolved against the cwd, so an absolute linkpath
  // used to reach any file on the system, and the resulting hardlink then
  // exposed that file for writing through the extraction directory.
  t.test('absolute hardlink linkpath cannot reach outside the cwd', t => {
    // keep this short: the header linkpath field is only 100 bytes
    const secretFile = path.resolve(os.tmpdir(),
      'tar-ghsa-8qq5-' + Math.random().toString(36).substr(2) + '.txt')
    t.ok(secretFile.length < 100, 'linkpath fits in the tar header')
    t.teardown(_ => rimraf.sync(secretFile))

    const data = tarWithLink('exploit_hard', 'Link', secretFile)
    const warnings = []
    const root = path.parse(secretFile).root

    const check = (t, cwd) => {
      // the failed fs.link surfaces as a second warning, so only pin the first
      t.same(warnings.slice(0, 1), [[
        'stripping ' + root + ' from absolute linkpath',
        secretFile
      ]], 'warned about stripping the linkpath root')
      // the de-rooted linkpath resolves inside the cwd, where nothing exists,
      // so no hardlink to the secret file is ever created
      const hard = path.resolve(cwd, 'exploit_hard')
      t.throws(_ => fs.lstatSync(hard), 'no hardlink was created')
      try {
        fs.writeFileSync(hard, 'OVERWRITTEN')
      } catch (er) {}
      t.equal(fs.readFileSync(secretFile, 'utf8'), 'ORIGINAL DATA',
        'secret file outside the cwd is untouched')
      t.end()
    }

    t.test('async', t => {
      const cwd = testdir()
      warnings.length = 0
      fs.writeFileSync(secretFile, 'ORIGINAL DATA')
      new Unpack({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).on('close', _ => check(t, cwd)).end(data)
    })

    t.test('sync', t => {
      const cwd = testdir()
      warnings.length = 0
      fs.writeFileSync(secretFile, 'ORIGINAL DATA')
      new UnpackSync({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).end(data)
      check(t, cwd)
    })

    t.end()
  })

  // a rootless linkpath full of '..' is written to disk verbatim for a
  // symbolic link, and that is fine: the symlink itself only *points* out of
  // the extraction directory, it does not write there.  Extracting through
  // such a link is what is dangerous, and that is blocked separately.
  t.test('allow rootless dotted symlink linkpath', t => {
    const lp = '../../../etc/passwd'
    const data = tarWithLink('sym', 'SymbolicLink', lp)
    const warnings = []

    const check = (t, cwd) => {
      t.same(warnings, [], 'no warnings')
      const sym = path.resolve(cwd, 'sym')
      t.ok(fs.lstatSync(sym).isSymbolicLink(), 'is symlink')
      t.equal(fs.readlinkSync(sym), lp, 'linkpath is not modified')
      t.same(fs.readdirSync(cwd), [ 'sym' ], 'only the symlink extracted')
      t.end()
    }

    t.test('async', t => {
      const cwd = testdir()
      warnings.length = 0
      new Unpack({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).on('close', _ => check(t, cwd)).end(data)
    })

    t.test('sync', t => {
      const cwd = testdir()
      warnings.length = 0
      new UnpackSync({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).end(data)
      check(t, cwd)
    })

    t.end()
  })

  // GHSA-34x7-hfp2-rc4v: a hard link's linkpath is resolved against the cwd
  // by fs.link, so a rootless linkpath full of '..' hands the archive a
  // writable hard link to any file above the extraction directory.  Unlike a
  // symbolic link's, a hard link's dotted linkpath must be rejected.
  t.test('reject rootless dotted hardlink linkpath', t => {
    const lp = '../../../etc/passwd'
    const data = tarWithLink('exploit_hard', 'Link', lp)
    const warnings = []

    const check = (t, cwd) => {
      t.same(warnings, [[
        'linkpath contains \'..\'',
        lp
      ]], 'warned about the dotted linkpath')
      t.throws(_ => fs.lstatSync(path.resolve(cwd, 'exploit_hard')),
        'escaping hardlink is not created')
      t.same(fs.readdirSync(cwd), [], 'nothing extracted into cwd')
      t.end()
    }

    t.test('async', t => {
      const cwd = testdir()
      warnings.length = 0
      new Unpack({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).on('close', _ => check(t, cwd)).end(data)
    })

    t.test('sync', t => {
      const cwd = testdir()
      warnings.length = 0
      new UnpackSync({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).end(data)
      check(t, cwd)
    })

    t.end()
  })

  // negative control: an ordinary relative linkpath is still written verbatim,
  // with no warnings, for both link types
  t.test('allow ordinary relative linkpath', t => {
    const lp = 'sibling/file'
    const data = tarWithLink('sym', 'SymbolicLink', lp)
    const warnings = []

    const check = (t, cwd) => {
      t.same(warnings, [], 'no warnings')
      const sym = path.resolve(cwd, 'sym')
      t.ok(fs.lstatSync(sym).isSymbolicLink(), 'is symlink')
      t.equal(fs.readlinkSync(sym), lp, 'linkpath is not modified')
      t.end()
    }

    t.test('async', t => {
      const cwd = testdir()
      warnings.length = 0
      new Unpack({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).on('close', _ => check(t, cwd)).end(data)
    })

    t.test('sync', t => {
      const cwd = testdir()
      warnings.length = 0
      new UnpackSync({
        cwd: cwd,
        onwarn: (w, d) => warnings.push([w, d])
      }).end(data)
      check(t, cwd)
    })

    t.end()
  })

  // preservePaths opts out of every sanitization, including the linkpath ones
  t.test('preservePaths keeps the absolute linkpath', t => {
    const lp = '/some/absolute/path'
    const data = tarWithLink('sym', 'SymbolicLink', lp)
    const warnings = []
    const cwd = testdir()

    new UnpackSync({
      cwd: cwd,
      preservePaths: true,
      onwarn: (w, d) => warnings.push([w, d])
    }).end(data)

    t.same(warnings, [], 'no warnings')
    t.equal(fs.readlinkSync(path.resolve(cwd, 'sym')), lp,
      'linkpath is preserved')
    t.end()
  })

  t.end()
})

t.test('GHSA-34x7-hfp2-rc4v hardlink .. escape', t => {
  // A hard link's linkpath is resolved against the cwd by fs.link, so a
  // linkpath containing '..' creates a second, writable name for a file
  // above the extraction directory.  Those must be rejected.  Symbolic link
  // linkpaths containing '..' are allowed: they are written to disk verbatim
  // and only ever *point* outside, which is inert on its own.
  const dir = testdir()
  const secretFile = path.resolve(dir, 'secret.txt')

  const hardLp = '../secret.txt'
  const nestedLp = '../../secret.txt'

  const data = makeTar([
    {
      path: 'exploit_hard',
      type: 'Link',
      linkpath: hardLp,
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    {
      path: 'sub/',
      type: 'Directory',
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    {
      path: 'sub/nested_hard',
      type: 'Link',
      linkpath: nestedLp,
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    {
      path: 'valid_sym',
      type: 'SymbolicLink',
      linkpath: hardLp,
      mtime: new Date('2011-03-27T22:16:31.000Z')
    },
    '',
    ''
  ])

  const setup = name => {
    const cwd = path.resolve(dir, name)
    rimraf.sync(cwd)
    mkdirp.sync(cwd)
    fs.writeFileSync(secretFile, 'ORIGINAL DATA')
    return cwd
  }

  const check = (t, cwd, warnings) => {
    // both hard links are rejected, in archive order, and nothing else warns
    t.same(warnings, [
      [ 'linkpath contains \'..\'', hardLp ],
      [ 'linkpath contains \'..\'', nestedLp ]
    ], 'warned about both dotted hardlink linkpaths')

    // neither hard link exists, so there is no second name for the secret
    t.throws(_ => fs.lstatSync(path.resolve(cwd, 'exploit_hard')),
      'no hardlink was created')
    t.throws(_ => fs.lstatSync(path.resolve(cwd, 'sub/nested_hard')),
      'no nested hardlink was created')

    // the secret file above the cwd has exactly one name, and is untouched
    t.equal(fs.statSync(secretFile).nlink, 1,
      'secret file still has a single link')
    t.equal(fs.readFileSync(secretFile, 'utf8'), 'ORIGINAL DATA',
      'secret file outside the cwd is untouched')

    // a relative symlink is legitimate, and is written verbatim
    const sym = path.resolve(cwd, 'valid_sym')
    t.ok(fs.lstatSync(sym).isSymbolicLink(), 'symlink created')
    t.equal(fs.readlinkSync(sym), hardLp, 'linkpath is not modified')

    t.same(fs.readdirSync(cwd).sort(), [ 'sub', 'valid_sym' ],
      'only the directory and the symlink were extracted')
    t.same(fs.readdirSync(path.resolve(cwd, 'sub')), [],
      'nothing was extracted into the subdirectory')
    t.end()
  }

  t.test('async', t => {
    const cwd = setup('async')
    const warnings = []
    new Unpack({
      cwd: cwd,
      onwarn: (w, d) => warnings.push([w, d])
    }).on('close', _ => check(t, cwd, warnings)).end(data)
  })

  t.test('sync', t => {
    const cwd = setup('sync')
    const warnings = []
    new UnpackSync({
      cwd: cwd,
      onwarn: (w, d) => warnings.push([w, d])
    }).end(data)
    check(t, cwd, warnings)
  })

  t.end()
})
