// Copyright 2012 The Obvious Corporation.

/**
 * @fileoverview Provides the Falkor testing library.
 */

var util = require('util')
var urlLib = require('url')


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

  /** String containing the request payload. */
  this._payload = null

  /** The HTTP method to use when making the request. */
  this._httpMethod = 'GET'
}


/**
 * Reference to the HTTP library to use when making requests.  By default just uses node.
 */
TestCase.prototype._http = require('http')


/**
 * Payload to be sent with the request.
 */
TestCase.prototype._payload = null


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
 * Sets the HTTP method to use when making the request.
 * @param {string} method
 */
TestCase.prototype.withMethod = function (method) {
  this._httpMethod = method
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
    , headers: this._headers
  }

  // Sends the request, with an optional payload.
  var self = this
  var req = this._http.request(options, this._handleHttpResponse.bind(this))
  req.on('error', this._handleHttpError.bind(this))
  if (this._payload) req.write(this._payload, 'utf8')
  req.end()
}


/**
 * Handles a successful response.  The assertions registered will be executed in the order they were
 * added.
 */
TestCase.prototype._handleHttpResponse = function (res) {
  // Handle all the assertions.
  this._asserter.done()
}


/**
 * Handles a failure when making the HTTP request.  The test will be failed.
 */
TestCase.prototype._handleHttpError = function (e) {
  this._asserter.fail('Request for ' + this._url + ' failed. ' + e.message)
  this._asserter.done()
}

