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

var fs = require('fs')
var http = require('http')
var https = require('https')
var log = console.log.bind(console)
var path = require('path')
var util = require('util')
var urlLib = require('url')
var JSONSchemaValidator = require('./json-schema/json-schema').JSONSchemaValidator
var Sink = require('pipette').Sink

var baseUrl = ''
var rootSchemaPath = ''


/** The main external interface is via the `falkor.fetch` method. */
exports.fetch = createNodeUnitTestFn


/** We also expose the TestCase class for anyone who wants more control. */
exports.TestCase = TestCase


/**
 * Sets a global base URL from which other URLs are resolved.
 * @param {string} url
 */
exports.setBaseUrl = function (url) {
  baseUrl = url
}


/**
 * Sets a global path from which schema paths are resolved.
 * @param {string} url
 */
exports.setRootSchemaPath = function (path) {
  rootSchemaPath = path
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

  /** An XSSI Prefix to strip from the response body before trying to parse JSON. */
  this._xssiPrefix = ''

  /** Array of functions that will be called to verify the response. */
  this._evaluators = []
}


/**
 * Sets the asserter object to use when verifying expectations.  This is expected to expose the same
 * interface as the nodeunit test object.
 * @param {Object} asserter An object which exposes the nodeunit test interface.
 * @return {TestCase} The instance.
 */
TestCase.prototype.setAsserter = function (asserter) {
  this._asserter = asserter
  return this
}


/**
 * Dumps debugging information about the request and the response to the console.
 * @return {TestCase} The instance.
 */
TestCase.prototype.dump = function () {
  this._dump = true
  return this
}


/**
 * Sets the HTTP method to use when making the request.
 * @param {string} method
 * @return {TestCase} The instance.
 */
TestCase.prototype.withMethod = function (method) {
  this._httpMethod = method.toUpperCase()
  return this
}


/**
 * Adds a header to be sent with the request.
 * @param {string} key
 * @param {string} value
 * @return {TestCase} The instance.
 */
TestCase.prototype.withHeader = function (key, value) {
  this._headers[key] = value
  return this
}


/**
 * Sets the 'Content-Type' header.
 * @param {string} contentType
 * @return {TestCase} The instance.
 */
TestCase.prototype.withContentType = function (contentType) {
  this._headers['Content-Type'] = contentType
  return this
}


/**
 * Sets a cookie on the request.
 * @param {string} name The raw cookie name, must be valid (i.e. no equals or semicolons).
 * @param {string} value The raw cookie value, must be valid (i.e. no equals or semicolons).
 * @return {TestCase} The instance.
 */
TestCase.prototype.withCookie = function (name, value, options) {
  this._cookies[name] = value
  return this
}


/**
 * Sets the request payload.
 * @param {string} body A string.
 * @return {TestCase} The instance.
 */
TestCase.prototype.withPayload = function (payload) {
  this._payload = payload
  return this
}


/**
 * Sets the request payload to be a form encoded string based off the key/value pairs in the
 * provided object.  Will also set the Content-Type header to be application/x-www-form-urlencoded.
 * @param {Object} payload
 * @return {TestCase} The instance.
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
 * @return {TestCase} The instance.
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
 * @return {TestCase} The instance.
 */
TestCase.prototype.evaluate = function (fn) {
  this._evaluators.push(fn)
  return this
}


/**
 * Sets an expectation that a specific status code should be recieved.
 * @param {number} statusCode
 * @return {TestCase} The instance.
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
 * @return {TestCase} The instance.
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
 * @return {TestCase} The instance.
 */
TestCase.prototype.expectContentType = function (contentType, opt_charset) {
  if (opt_charset) contentType += '; charset=' + opt_charset
  this.expectHeader('Content-Type', contentType)
  return this
}


/**
 * Sets an expectation that the response should be plain text.
 * @return {TestCase} The instance.
 */
TestCase.prototype.expectPlainText = function () {
  this.expectContentType('text/plain')
  return this
}


/**
 * Sets an expectation that the response should be html.
 * @return {TestCase} The instance.
 */
TestCase.prototype.expectHtml = function () {
  this.expectContentType('text/html')
  return this
}


/**
 * Sets an expectation that the response should be HTML with a specific charset.
 * @param {string} opt_charset Optional charset, will be utf-8 if omitted.
 * @return {TestCase} The instance.
 */
TestCase.prototype.expectHtmlWithCharset = function (opt_charset) {
  this.expectContentType('text/html', opt_charset || 'utf-8')
  return this
}


/**
 * Sets an expectation that the response should be json.
 * @return {TestCase} The instance.
 */
TestCase.prototype.expectJson = function () {
  this.expectContentType('application/json')
  return this
}


/**
 * Sets an expectation that the response should be JSON with a specific charset.
 * @param {string} opt_charset Optional charset, will be utf-8 if omitted.
 * @return {TestCase} The instance.
 */
TestCase.prototype.expectJsonWithCharset = function (opt_charset) {
  this.expectContentType('application/json', opt_charset || 'utf-8')
  return this
}


/**
 * Sets an expectation that the response body should match the provided regular expression.
 * @param {RegExp} re
 * @return {TestCase} The instance.
 */
TestCase.prototype.expectBodyMatches = function (re) {
  this.evaluate(function (test, res) {
    test.ok(re.test(res.body ? res.body.toString('utf8') : ''),
        'Expected response body to match ' + re.toString())
  })
  return this
}


/**
 * Checks that the response body starts with the XSSI prefix.  Also test JSON validation to remove
 * the prefix before parsing.
 * @param {string} prefix The XSSI Prefix, e.g. ])}while(1);</x>
 * @return {TestCase} The instance.
 */
TestCase.prototype.expectXssiPrefix = function (prefix) {
  this._xssiPrefix = prefix
  this.evaluate(function (test, res) {
    if (res.body) {
      test.equals(res.body.toString().substr(0, prefix.length), prefix,
          'Expected XSSI prefix at beginning of response body.')
    } else {
      test.fail('Expected XSSI prefix but response was empty.')
    }
  })
  return this
}


/**
 * Validates the response against the JSON Schema in the provided file.
 * @param {string} schemaPath Path to the schema file.
 * @return {TestCase} The instance.
 */
TestCase.prototype.validateJson = function (schemaPath) {
  if (rootSchemaPath) {
    schemaPath = path.resolve(rootSchemaPath, schemaPath)
  }

  this.evaluate(function (test, res) {
    if (!res.body) {
      test.fail('Expected response body for JSON validation.')
      return
    }

    var body = res.body.toString('utf8')
    if (this._xssiPrefix) body = body.substr(this._xssiPrefix.length)

    var json, schemaFile, schema
    try {
      json = JSON.parse(body)
    } catch (e) {
      test.fail('Invalid response body. JSON parsing failed.  ' + e.message)
      return
    }

    try {
      schemaFile = fs.readFileSync(schemaPath, 'utf8')
    } catch (e) {
      test.fail('Invalid JSON Schema. Unable to open file: ' + schemaPath)
      return
    }

    try {
      schema = JSON.parse(schemaFile)
    } catch (e) {
      test.fail('Invalid JSON Schema. JSON parsing failed.  ' + e.message)
      return
    }

    var validator = new JSONSchemaValidator()
    validator.validate(json, schema);
    if (validator.errors.length > 0) {
      var errorMessage = ['Invalid response body. JSON Schema validation failed.']
      for (var i = 0; i < validator.errors.length; i++) {
        var error = validator.errors[i]
        errorMessage.push('  Error @ /' + error.path + ': ' + error.message)
      }
      test.fail(errorMessage.join(' '))
    }
  })
  return this
}


/**
 * Starts the test.  Makes the request and runs the asserts.
 */
TestCase.prototype.run = function () {
  if (!this._asserter) throw Error('No asserter object has been configured')

  // Get a parsed URL, relative to the baseUrl if there is one.
  var url = urlLib.parse(baseUrl ? urlLib.resolve(baseUrl, this._url) : this._url)

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
