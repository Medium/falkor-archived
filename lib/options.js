// Copyright 2012 The Obvious Corporation.

/**
 * @fileoverview Base class for storing and setting options for falkor.
 */

var fs = require('fs')
var path = require('path')
var JSONSchemaValidator = require('./json-schema/json-schema').JSONSchemaValidator

var config = require('./globalconfig')


/**
 * @constructor
 */
function Options() {

  /** Map of headers to add to the request. */
  this._headers = {}

  /** Map of cookies to be set on the request. */
  this._cookies = []

  /** String containing the request payload. */
  this._payload = null

  /** The HTTP method to use when making the request. */
  this._httpMethod = 'GET'

  /** An XSSI Prefix to strip from the response body before trying to parse JSON. */
  this._xssiPrefix = ''

  /** Array of functions that will be called to verify the response. */
  this._evaluators = []

  // NOTE: When adding options make sure to add a corresponding copy step in _copy below.
}
module.exports = Options


/**
 * Sets the HTTP method to use when making the request.
 * @param {string} method
 * @return {Options} The instance.
 */
Options.prototype.withMethod = function (method) {
  this._httpMethod = method.toUpperCase()
  return this
}


/**
 * Adds a header to be sent with the request.
 * @param {string} key
 * @param {string} value
 * @return {Options} The instance.
 */
Options.prototype.withHeader = function (key, value) {
  this._headers[key] = value
  return this
}


/**
 * Sets the 'Content-Type' header.
 * @param {string} contentType
 * @return {Options} The instance.
 */
Options.prototype.withContentType = function (contentType) {
  this._headers['Content-Type'] = contentType
  return this
}


/**
 * Sets a cookie on the request.
 * @param {string} name The raw cookie name, must be valid (i.e. no equals or semicolons).
 * @param {string} value The raw cookie value, must be valid (i.e. no equals or semicolons).
 * @return {Options} The instance.
 */
Options.prototype.withCookie = function (name, value, options) {
  this._cookies[name] = value
  return this
}


/**
 * Sets the request payload.
 * @param {string} body A string.
 * @return {Options} The instance.
 */
Options.prototype.withPayload = function (payload) {
  this._payload = payload
  return this
}


/**
 * Sets the request payload to be a form encoded string based off the key/value pairs in the
 * provided object.  Will also set the Content-Type header to be application/x-www-form-urlencoded.
 * @param {Object} payload
 * @return {Options} The instance.
 */
Options.prototype.withFormEncodedPayload = function (payload) {
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
 * @return {Options} The instance.
 */
Options.prototype.withJsonPayload = function (payload) {
  this.withPayload(JSON.stringify(payload))
  this.withContentType('application/json')
  return this
}


/**
 * Adds an evaluator function that will be called with the response object and the asserter which
 * they can use to perform assertions against the response.
 * @param {function (this:Options, Object, ClientResponse)} fn
 * @return {Options} The instance.
 */
Options.prototype.evaluate = function (fn) {
  this._evaluators.push(fn)
  return this
}


/**
 * Sets an expectation that a specific status code should be recieved.
 * @param {number} statusCode
 * @return {Options} The instance.
 */
Options.prototype.expectStatusCode = function (statusCode) {
  this.evaluate(function (test, res) {
    test.equals(res.statusCode, statusCode, 'Expected response code to be "' + statusCode + '"')
  })
  return this
}


/**
 * Sets an expectation that a header should have a specific value.
 * @param {string} name
 * @param {string} value
 * @return {Options} The instance.
 */
Options.prototype.expectHeader = function (name, value) {
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
 * @return {Options} The instance.
 */
Options.prototype.expectContentType = function (contentType, opt_charset) {
  if (opt_charset) contentType += '; charset=' + opt_charset
  this.expectHeader('Content-Type', contentType)
  return this
}


/**
 * Sets an expectation that the response should be plain text.
 * @return {Options} The instance.
 */
Options.prototype.expectPlainText = function () {
  this.expectContentType('text/plain')
  return this
}


/**
 * Sets an expectation that the response should be html.
 * @return {Options} The instance.
 */
Options.prototype.expectHtml = function () {
  this.expectContentType('text/html')
  return this
}


/**
 * Sets an expectation that the response should be HTML with a specific charset.
 * @param {string} opt_charset Optional charset, will be utf-8 if omitted.
 * @return {Options} The instance.
 */
Options.prototype.expectHtmlWithCharset = function (opt_charset) {
  this.expectContentType('text/html', opt_charset || 'utf-8')
  return this
}


/**
 * Sets an expectation that the response should be json.
 * @return {Options} The instance.
 */
Options.prototype.expectJson = function () {
  this.expectContentType('application/json')
  return this
}


/**
 * Sets an expectation that the response should be JSON with a specific charset.
 * @param {string} opt_charset Optional charset, will be utf-8 if omitted.
 * @return {Options} The instance.
 */
Options.prototype.expectJsonWithCharset = function (opt_charset) {
  this.expectContentType('application/json', opt_charset || 'utf-8')
  return this
}


/**
 * Sets an expectation that the response body should match the provided regular expression.
 * @param {RegExp} re
 * @return {Options} The instance.
 */
Options.prototype.expectBodyMatches = function (re) {
  this.evaluate(function (test, res) {
    test.ok(re.test(res.body ? res.body.toString('utf8') : ''),
        'Expected response body to match ' + re.toString())
  })
  return this
}


/**
 * Sets an expectation that the response body should not match the provided regular expression.
 * @param {RegExp} re
 * @return {Options} The instance.
 */
Options.prototype.expectBodyDoesNotMatch = function (re) {
  this.evaluate(function (test, res) {
    test.ok(!re.test(res.body ? res.body.toString('utf8') : ''),
        'Expected response body not to match ' + re.toString())
  })
  return this
}


/**
 * Checks that the response body starts with the XSSI prefix.  Also test JSON validation to remove
 * the prefix before parsing.
 * @param {string} prefix The XSSI Prefix, e.g. ])}while(1);</x>
 * @return {Options} The instance.
 */
Options.prototype.expectXssiPrefix = function (prefix) {
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
 * @return {Options} The instance.
 */
Options.prototype.validateJson = function (schemaPath) {
  if (config.rootSchemaPath) {
    schemaPath = path.resolve(config.rootSchemaPath, schemaPath)
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
 * Returns a new object containing all the headers.
 */
Options.prototype.getHeaders = function () {
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
 * Copies the settings from another Options object to this one. Intended for internal use only.
 * @param {Options} source
 */
Options.prototype._copy = function (source) {
  this._headers = source.getHeaders()
  this._cookies = source._cookies.concat()
  this._payload = source._payload
  this._httpMethod = source._httpMethod
  this._xssiPrefix = source._xssiPrefix
  this._evaluators = source._evaluators.concat()
}
