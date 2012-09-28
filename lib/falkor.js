// Copyright 2012 The Obvious Corporation.

/**
 * @fileoverview Provides the Falkor testing library.
 *
 * Quick reference for NodeUnit assertion functions:
 *   ok(value, [message]) - Tests if value is a true value.
 *   equal(actual, expected, [message]) - Tests shallow, coercive equality with the equal comparison operator ( == ).
 *   notEqual(actual, expected, [message]) - Tests shallow, coercive non-equality with the not equal comparison operator ( != ).
 *   deepEqual(actual, expected, [message]) - Tests for deep equality.
 *   notDeepEqual(actual, expected, [message]) - Tests for any deep inequality.
 *   strictEqual(actual, expected, [message]) - Tests strict equality, as determined by the strict equality operator ( === )
 *   notStrictEqual(actual, expected, [message]) - Tests strict non-equality, as determined by the strict not equal operator ( !== )
 *   throws(block, [error], [message]) - Expects block to throw an error.
 *   doesNotThrow(block, [error], [message]) - Expects block not to throw an error.
 *   ifError(value) - Tests if value is not a false value, throws if it is a true value. Useful when testing the first argument, error in callbacks.
 */

var http = require('http')
var https = require('https')
var log = console.log.bind(console)
var util = require('util')
var urlLib = require('url')
var Sink = require('pipette').Sink


/** The main external interface is via the `falkor.fetch` method. */
exports.fetch = createNodeUnitTestFn


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



/**
 * @param {string} url The URL to fetch for this test case.
 * @constructor
 */
function TestCase(url) {

  /** The full URL to make a request to. */
  this._url = url

  /** Map of headers to add to the request. */
  this._headers = {}

  /** Map of cookies to be set on the request. */
  this._cookies = []

  /** String containing the request payload. */
  this._payload = null

  /** The HTTP method to use when making the request. */
  this._httpMethod = 'GET'

  /** Whether to log debugging information to the console. */
  this._dump = false

  /** Array of functions that will be called to verify the response. */
  this._evaluators = []
}



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
 * Dumps debugging information about the request and the response to the console.
 */
TestCase.prototype.dump = function () {
  this._dump = true
  return this
}


/**
 * Sets the HTTP method to use when making the request.
 * @param {string} method
 */
TestCase.prototype.withMethod = function (method) {
  this._httpMethod = method.toUpperCase()
  return this
}


/**
 * Adds a header to be sent with the request.
 * @param {string} key
 * @param {string} value
 */
TestCase.prototype.withHeader = function (key, value) {
  this._headers[key] = value
  return this
}


/**
 * Sets the 'Content-Type' header.
 * @param {string} contentType
 */
TestCase.prototype.withContentType = function (contentType) {
  this._headers['Content-Type'] = contentType
  return this
}


/**
 * Sets a cookie on the request.
 * @param {string} name The raw cookie name, must be valid (i.e. no equals or semicolons).
 * @param {string} value The raw cookie value, must be valid (i.e. no equals or semicolons).
 */
TestCase.prototype.withCookie = function (name, value, options) {
  this._cookies[name] = value
  return this
}

/**
 * Sets the request payload.
 * @param {string|Buffer} body A string or buffer object.
 */
TestCase.prototype.withPayload = function (payload) {
  this._payload = payload
  return this
}


/**
 * Sets the request payload to be a form encoded string based off the key/value pairs in the
 * provided object.  Will also set the Content-Type header to be application/x-www-form-urlencoded.
 * @param {Object} payload
 */
TestCase.prototype.withFormEncodedPayload = function (payload) {
  var parts = []
  for (var key in payload) {
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(payload[key]))
  }
  this.withPayload(parts.join('&'))
  this.withContentType('application/x-www-form-urlencoded')
  return this
}


/**
 * Sets the request payload to be serialized json, sets the Content-Type header to be
 * application/json.
 * @param {Object} payload
 */
TestCase.prototype.withJsonPayload = function (payload) {
  this.withPayload(JSON.stringify(payload))
  this.withContentType('application/json')
  return this
}


/**
 * Adds an evaluator function that will be called with the response object and the asserter which
 * they can use to perform assertions against the response.
 * @param {function (this:TestCase, Object, ClientResponse)} fn
 */
TestCase.prototype.evaluate = function (fn) {
  this._evaluators.push(fn)
  return this
}


/**
 * Sets an expectation that a specific status code should be recieved.
 * @param {number} statusCode
 */
TestCase.prototype.expectStatusCode = function (statusCode) {
  this.evaluate(function (test, res) {
    test.equals(res.statusCode, statusCode, 'Expected response code to be "' + statusCode + '"')
  })
  return this
}


/**
 * Sets an expectation that a header should have a specific value.
 * @param {string} name
 * @param {string} value
 */
TestCase.prototype.expectHeader = function (name, value) {
  name = name.toLowerCase() // node lowercases headers.
  this.evaluate(function (test, res) {
    test.equals(res.headers[name], value, 'Expected "' + name + '" header to be "' + value + '"')
  })
  return this
}


/**
 * Sets an expectation that the response should have a specific content type.
 * @param {string} contentType
 * @param {string} opt_charset Optional charset, if omitted header won't look for any charset.
 */
TestCase.prototype.expectContentType = function (contentType, opt_charset) {
  if (opt_charset) contentType += '; charset=' + opt_charset
  this.expectHeader('Content-Type', contentType)
  return this
}


/**
 * Sets an expectation that the response should be plain text.
 */
TestCase.prototype.expectPlainText = function () {
  this.expectContentType('text/plain')
  return this
}


/**
 * Sets an expectation that the response should be html.
 */
TestCase.prototype.expectHtml = function () {
  this.expectContentType('text/html')
  return this
}


/**
 * Sets an expectation that the response should be HTML with a specific charset.
 * @param {string} opt_charset Optional charset, will be utf-8 if omitted.
 */
TestCase.prototype.expectHtmlWithCharset = function (opt_charset) {
  this.expectContentType('text/html', opt_charset || 'utf-8')
  return this
}


/**
 * Sets an expectation that the response should be json.
 */
TestCase.prototype.expectJson = function () {
  this.expectContentType('application/json')
  return this
}


/**
 * Sets an expectation that the response should be JSON with a specific charset.
 * @param {string} opt_charset Optional charset, will be utf-8 if omitted.
 */
TestCase.prototype.expectJsonWithCharset = function (opt_charset) {
  this.expectContentType('application/json', opt_charset || 'utf-8')
  return this
}


/**
 * Sets an expectation that the response body should match the provided regular expression.
 * @param {RegExp} re
 */
TestCase.prototype.expectBodyMatches = function (re) {
  this.evaluate(function (test, res) {
    test.ok(re.test(res.body ? res.body.toString('utf8') : ''), 'Expected response body to match ' +
        re.toString())
  })
  return this
}

// verifyJson


/**
 * Starts the test.  Makes the request and runs the asserts.
 */
TestCase.prototype.run = function () {
  if (!this._asserter) throw Error('No asserter object has been configured')

  // Prepare the request here.
  var url = typeof this._url == 'string' ? urlLib.parse(this._url) : this._url

  var options = {
      host: url.hostname
    , port: url.port || (url.protocol == 'https:' ? 443 : 80)
    , path: url.path || '/' // note: includes querystring
    , method: this._httpMethod
    , headers: this._getHeaders()
  }

  var httpLib = options.port == 443 ? https : http

  // Sends the request, with an optional payload.
  var req = httpLib.request(options, this._handleHttpResponse.bind(this))
  req.on('error', this._handleHttpError.bind(this))
  if (this._payload) req.write(this._payload, 'utf8')
  req.end()
}


/**
 * Returns a new object containing all the headers.
 */
TestCase.prototype._getHeaders = function () {
  var headers = {}
  for (var key in this._headers) headers[key] = this._headers[key]

  // Only set the cookies if the Set-Cookie hasn't been explicitly set.
  if (!headers['Cookie']) {
    var cookies = []
    for (var name in this._cookies) {
      cookies.push(name + '=' + this._cookies[name])
    }
    if (cookies.length > 0) headers['Cookie'] = cookies.join('; ')
  }

  return headers
}


/**
 * Handles a successful response.  The assertions registered will be executed in the order they were
 * added.
 */
TestCase.prototype._handleHttpResponse = function (res) {
  var sink = new Sink(res).on('data', function (data) {
    if (data) res.body = data
  }.bind(this))

  // TODO(dan): Sink doesn't always seem to execute, in particular for 302s where there is no
  // response body.
  res.on('end', this._finalize.bind(this, res))
}


/**
 * Handles a failure when making the HTTP request.  The test will be failed.
 */
TestCase.prototype._handleHttpError = function (e) {
  this._asserter.fail('Request for ' + this._url + ' failed. ' + e.message)
  this._asserter.done()
}


/**
 * Runs the assertions against the response and marks the test as complete.
 */
TestCase.prototype._finalize = function (res) {
  if (this._dump) this._dumpInfo(res)

  // Run all the evaluators in the scope of the test case.
  for (var i = 0; i < this._evaluators.length; i++) {
    this._evaluators[i].call(this, this._asserter, res)
  }

  this._asserter.done()
}


/**
 * Writes out information about the request and the response to the console.
 */
TestCase.prototype._dumpInfo = function (res) {
  log('Request URL:', this._url)
  log('Request Method:', this._httpMethod)
  log('Status Code:', res.statusCode)

  if (this._payload) {
    log('Request Payload:')
    log('    ', this._payload.split('\n').join('\n     '))
 }

  log('Request Headers:')
  var headers = this._getHeaders()
  for (var header in headers) {
    log('    ', header + ':', headers[header])
  }

  log('Response Headers:')
  for (var header in res.headers) {
    log('    ', header + ':', res.headers[header])
  }

  if (res.body) {
    log('Respose Body:')
    log('    ', res.body.toString('utf8').split('\n').join('\n     '))
  }
}
