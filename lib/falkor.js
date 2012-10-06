// Copyright 2012 The Obvious Corporation.

/**
 * @fileoverview Falkor HTTP Functional Testing library.
 *
 * Quick usage guide:
 * ------------------
 * Falkor's fetch method returns a nodeunit compatible test function with additional methods hanging
 * off it that can be used to modify how the request gets made and the expectations that are applied
 * to the response.  The most simple usage is to create a test file and run it with nodeunit.  For
 * a more detailed read the public interface methods or visit github.com/Obvious/falkor.
 *
 * <pre>
 *   // In: medium_test.js
 *   var falkor = require('./lib/falkor')
 *
 *   exports.testMedium = falkor.fetch('https://medium.com/me/collections')
 *       .withCookie('uid', '1234567890')
 *       .withCookie('auth_issued', '1348710833402')
 *       .withCookie('auth_sign', 'a10003c4bc88afc39e920889849da12e')
 *       .expectStatusCode(200)
 *       .expectJsonWithCharset()
 *       .expectXssiPrefix('])}while(1);</x>')
 *       .validateJson('my-collections.schema')
 *       .dump()
 *
 *   // On command line:
 *   nodeunit medium_test.js
 * </pre>
 *
 * (NOTE: this test will fail because the auth credentials are made up... :P)
 *
 * NodeUnit Quick Reference:
 * -------------------------
 * The test/asserter object has the following methods:
 *
 *   ok(value, [message]) - Tests if value is a true value.
 *   equal(actual, expected, [message]) - Tests shallow ( == ).
 *   notEqual(actual, expected, [message]) - Tests shallow ( != ).
 *   deepEqual(actual, expected, [message]) - Tests for deep equality.
 *   notDeepEqual(actual, expected, [message]) - Tests for any deep inequality.
 *   strictEqual(actual, expected, [message]) - Tests strict equality ( === ).
 *   notStrictEqual(actual, expected, [message]) - Tests strict non-equality ( !== ).
 *   throws(block, [error], [message]) - Expects block to throw an error.
 *   doesNotThrow(block, [error], [message]) - Expects block not to throw an error.
 *   ifError(value) - Tests if value is not a false value, throws if it is a true value.
 *
 * Json Validation:
 * ----------------
 * JSON responses can be validated using JSON Schema.  To find out more about syntax and usage visit
 * http://json-schema.org.  Falkor just expecta a schema file and will validate the response against
 * that schema using the implementation from https://github.com/garycourt/JSV.
 */

var TestCase = require('./testcase')
var config = require('./globalconfig')


/** The main external interface is via the `falkor.fetch` method. */
exports.fetch = createNodeUnitTestFn


/** We also expose the TestCase class for anyone who wants more control. */
exports.TestCase = TestCase


/**
 * Sets a global base URL from which other URLs are resolved.
 * @param {string} url
 */
exports.setBaseUrl = function (url) {
  config.baseUrl = url
}


/**
 * Sets a global path from which schema paths are resolved.
 * @param {string} url
 */
exports.setRootSchemaPath = function (path) {
  config.rootSchemaPath = path
}


/**
 * Returns a nodeunit compatible test function. The function exposes methods that can be used to
 * modify its behavior and expectations.
 * @param {string} url The URL to request.
 * @return {function (!Object)}
 */
function createNodeUnitTestFn(url) {
  var testCase = new TestCase(url)

  // The test function expects a nodeunit test object.  When executed the function starts the test
  // case which will call 'test.done' if the test was successful, otherwise a nodeunit assert should
  // finalize the test.
  var fn = function (test) {
    testCase.setAsserter(test)
    testCase.run()
  }

  // We expose each public method on the TestCase through a method on the test function. This allows
  // for convenient chaining without a final 'build' call.
  for (var key in testCase) {
    (function (k) {
      // Anonymous function seals scope.
      if (k.charAt(0) != '_' && typeof testCase[k] == 'function') {
        fn[k] = function () {
          testCase[k].apply(testCase, arguments)
          return fn
        }
      }
    })(key)
  }
  return fn
}
