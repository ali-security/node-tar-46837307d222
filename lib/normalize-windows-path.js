// on windows, either \ or / are valid directory separators.
// on unix, \ is a valid character in filenames.
// so, on windows, and only on windows, we replace all \ chars with /,
// so that we can use / as our one and only directory separator char.

// Coerce non-null values to string (defends against pax type-confusion,
// CVE-2026-59871) while preserving the null/undefined passthrough, since
// callers hand us a possibly-null header.linkpath.
const platform = process.env.TESTING_TAR_FAKE_PLATFORM || process.platform
module.exports = platform !== 'win32'
  ? p => (p === null || p === undefined ? p : String(p))
  : p => (p === null || p === undefined ? p : String(p).replace(/\\/g, '/'))
