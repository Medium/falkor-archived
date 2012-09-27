// Copyright 2012 The Obvious Corporation.

/**
 * @fileoverview Tests for Falkor.
 */

var falkor = require('../lib/falkor')

// Simply tests that a request gets made to google.com and the test callback is executed.  For this
// test we don't care what happens to the response.
exports.testBasicFunctionality = falkor.get('http://www.google.com/')


// Tests that a failed request correctly propagates the failure and doesn't lead to a test success.
exports.testRequestFailures = function (test) {
  var testFn = falkor.get('http://www.xtz.comx')
  var mockTest = {
    fail: function (msg) {
      mockTest.failed = true
    },
    done: function () {
      if (!mockTest.failed) test.fail('Test should have failed')
      test.done()
    }
  }

  testFn(mockTest)
}
