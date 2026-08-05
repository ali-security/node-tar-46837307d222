const t = require('tap')

const realPlatform = process.platform
const fakePlatform = realPlatform === 'win32' ? 'posix' : 'win32'

function reload(mod) {
  delete require.cache[require.resolve(mod)];
  return require(mod)
}

t.test('posix', t => {
  if (realPlatform === 'win32')
    process.env.TESTING_TAR_FAKE_PLATFORM = fakePlatform
  else
    delete process.env.TESTING_TAR_FAKE_PLATFORM
  const normPath = reload('../lib/normalize-windows-path.js')
  t.equal(normPath('/some/path/back\\slashes'), '/some/path/back\\slashes')
  t.equal(normPath('c:\\foo\\bar'), 'c:\\foo\\bar')
  t.end()
})

t.test('win32', t => {
  if (realPlatform !== 'win32')
    process.env.TESTING_TAR_FAKE_PLATFORM = fakePlatform
  else
    delete process.env.TESTING_TAR_FAKE_PLATFORM
  const normPath = reload('../lib/normalize-windows-path.js')
  t.equal(normPath('/some/path/back\\slashes'), '/some/path/back/slashes')
  t.equal(normPath('c:\\foo\\bar'), 'c:/foo/bar')
  t.end()
})

// a non-string path (eg a Number slurped out of a pax header) is coerced,
// so that consumers always get a string back (CVE-2026-59871), while
// null/undefined still pass through untouched.
const platforms = [ 'posix', 'win32' ]
t.test('coerce non-null values to string', t => {
  platforms.forEach(plat => {
    if (realPlatform === plat)
      delete process.env.TESTING_TAR_FAKE_PLATFORM
    else
      process.env.TESTING_TAR_FAKE_PLATFORM = plat
    const normPath = reload('../lib/normalize-windows-path.js')
    t.equal(normPath(12345), '12345', plat + ': number becomes string')
    t.equal(normPath(0), '0', plat + ': zero becomes string')
    t.equal(normPath(null), null, plat + ': null passes through')
    t.equal(normPath(undefined), undefined, plat + ': undefined passes through')
  })
  t.end()
})
