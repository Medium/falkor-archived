// Copyright 2012 The Obvious Corporation.

/**
 * @fileoverview The main falkor test case that makes the request and then validates the
 * expectations on the response.
 */

var http = require('http')
var https = require('https')
var log = console.log.bind(console)
var urlLib = require('url')
var util = require('util')
var Sink = require('pipette').Sink

var config = require('./globalconfig')
var Options = require('./options')



/**
 * @param {string} url The URL to fetch for this test case.
 * @constructor
 */
function TestCase(url) {
  TestCase.super_.call(this)

  /** The full URL to make a request to. */
  this._url = url

  /** Whether to log debugging information to the console. */
  this._dump = false
}
util.inherits(TestCase, Options)
module.exports = TestCase


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
 * Returns a nodeunit compatible test function. The function exposes methods that can be used to
 * modify its behavior and expectations.
 * @return {function (!Object)}
 */
TestCase.prototype.toNodeUnitFn = function () {
  var testCase = this

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
 * Starts the test.  Makes the request and runs the asserts.
 */
TestCase.prototype.run = function () {
  if (!this._asserter) throw Error('No asserter object has been configured')

  // Get a parsed URL, relative to the baseUrl if there is one.
  var url = urlLib.parse(config.baseUrl ? urlLib.resolve(config.baseUrl, this._url) : this._url)

  var options = {
      host: url.hostname
    , port: url.port || (url.protocol == 'https:' ? 443 : 80)
    , path: url.path || '/' // note: includes querystring
    , method: this._httpMethod
    , headers: this.getHeaders()
  }

  if (options.method === 'PUT' || options.method === 'POST') {
    // When there is no payload, a content length may not have
    // been set. This causes problems for certain servers (e.g., nginx),
    // so we set it here.
    if (!options.headers['Content-Length'] && !this._payload) {
      options.headers['Content-Length'] = 0
    }
  }

  var httpLib = options.port == 443 ? https : http

  // Sends the request, with an optional payload.
  var req = httpLib.request(options, this._handleHttpResponse.bind(this))
  req.on('error', this._handleHttpError.bind(this))
  if (this._payload) req.write(this._payload, 'utf8')
  req.end()
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
  var headers = this.getHeaders()
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
