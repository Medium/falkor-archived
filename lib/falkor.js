// Copyright 2012 The Obvious Corporation.

/**
 * @fileoverview Provides the Falkor testing library.
 */

var util = require('util')
var urlLib = require('url')


/** The main external interface is via the falkor.get method. */
exports.get = createNodeUnitTestFn


/** We also expose the TestCase class for anyone who wants more control. */
exports.TestCase = TestCase


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

  // We expose each public method on the testcase through a method on the test function. This allows
  // for convenient chaining without a final 'build' call.
  for (var key in testCase) {
    if (key.charAt(0) != '_' && typeof testCase[key] == 'function') {
      fn[key] = function () {
        testCase[key].apply(testCase, arguments)
        return fn
      }
    }
  }

  return fn
}



/**
 * @param {string} url The URL to fetch for this test case.
 * @constructor
 */
function TestCase(url) {
  this._url = typeof url == 'string' ? urlLib.parse(url) : url
}


/**
 * Reference to the HTTP library to use when making requests.  By default just uses node.
 */
TestCase.prototype._http = require('http')


/**
 * Sets the HTTP library to use when making the request. This allows for mocking out of network
 * layer in tests or other strange situations.
 */
TestCase.prototype.setHttpLib = function (http) {
  this._http = http
  return this
}


/**
 * Sets the asserter object to use when verifying expectations.  This is expected to expose the same
 * interface as the nodeunit test object.
 */
TestCase.prototype.setAsserter = function (asserter) {
  this._asserter = asserter
  return this
}


/**
 * Starts the test.  Makes the request and runs the asserts.
 */
TestCase.prototype.run = function () {
  if (!this._asserter) throw Error('No asserter object has been configured')

  var asserter = this._asserter

  this._http.get(this._url, this._handleHttpResponse.bind(this))
      .on('error', this._handleHttpError.bind(this))
}


TestCase.prototype._handleHttpResponse = function (res) {
  console.log('Got response: ' + res.statusCode)
  this._asserter.done()
}


TestCase.prototype._handleHttpError = function (e) {
  this._asserter.fail('Request for ' + util.inspect(this._url).replace(/\n/g, '') + ' failed. ' + e.message)
  this._asserter.done()
}

