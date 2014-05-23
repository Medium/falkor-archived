// Copyright 2012 The Obvious Corporation.

/**
 * @fileoverview The main falkor test case that makes the request and then validates the
 * expectations on the response.
 */

var http = require('http')
var https = require('https')
var util = require('util')
var Q = require('q')

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

  /** Whether dumps should also log the body. */
  this._dumpBody = false

  /** Functions called after the test case completes. */
  this._chained = []
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
 * @param {boolean} opt_dumpBody Whether to dump the body as well.
 * @return {TestCase} The instance.
 */
TestCase.prototype.dump = function (opt_dumpBody) {
  this._dump = true
  this._dumpBody = !!opt_dumpBody
  return this
}


/**
 * Runs this test case, and calls done() on the asserter.
 */
TestCase.prototype.done = function () {
  var test = this._asserter
  if (!test) throw new Error('Missing asserter')

  var self = this
  this._run()
  .fail(function (err) {
    self._log('ERROR ' + err)
    test.fail((err && err.stack) || err)
  })
  .fin(function () {
    test.done()
  })
  .done()
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
    testCase.done()
  }
  fn.isTestCaseNodeUnitFn = true

  // We expose each public method on the TestCase through a method on the test function. This allows
  // for convenient chaining without a final 'build' call.
  for (var key in testCase) {
    (function (k) {
      // Anonymous function seals scope.
      if ((k.charAt(0) != '_' || k === '_run') && typeof testCase[k] == 'function') {
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
 * Chains a promise function.
 *
 * If this is the first call to then(), the first argument will be the response.
 *
 * If this is the Nth call to then(), the first argument will be the result of the N-1th call to then()
 *
 * There are 3 types of reasonable return values for fn:
 * - A TestCase or TestCase#fetch result. We will run the TestCase, and pass the response to the
 *   next function in the chain.
 * - A promise. The TestCase will wait on the promise, and the resolved value will be passed to the
 *   next function in the chain.
 * - A value, which will simply be passed to the next .then() in the chain.
 *
 * @param {function (this:TestCase, ?)} fn A function
 *     that accepts a client response and returns a node unit compatible function, as returned by
 *     .fetch() or TestCase#toNodeUnitFn().
 * @return {Options} The instance.
 */
TestCase.prototype.then = function (fn) {
  this._chained.push(fn)
  return this
}


/**
 * @see #then
 * @deprecated
 */
TestCase.prototype.chain = function (fn) {
  return this.then(fn)
}


/**
 * Starts the test. Makes the request and runs the asserts.
 * @return {Q} A promise for when the test finishes. Resolves to the response, or to the result of the
 *     last then() chain.
 * @private
 */
TestCase.prototype._run = function () {
  if (!this._asserter) throw Error('No asserter object has been configured')

  var url = this.getParsedUrl()

  var options = {
      host: url.hostname
    , port: url.port || (url.protocol == 'https:' ? 443 : 80)
    , path: url.path || '/' // note: includes querystring
    , method: this._httpMethod || 'GET'
    , headers: this.getHeaders()
  }

  // When there is no payload, a content length may not have
  // been set. This causes problems for certain servers (e.g., nginx),
  // so we set it here.
  if (!options.headers['Content-Length'] && !this._payload) {
    options.headers['Content-Length'] = 0
  }

  var httpLib = options.port == 443 ? https : http

  // Sends the request, with an optional payload.
  var defer = Q.defer()
  var req = httpLib.request(options, this._handleHttpResponse.bind(this, defer))
  req.on('error', this._handleHttpError.bind(this, defer))
  if (this._payload) req.write(this._payload)
  req.end()

  var promise = defer.promise
  return  (this._timeoutMs > 0) ? promise.timeout(this._timeoutMs) : promise
}


/**
 * Handles a successful response.  The assertions registered will be executed in the order they were
 * added.
 */
TestCase.prototype._handleHttpResponse = function (defer, res) {
  var data = ''
  res.on('data', function (d) { data += d})
  res.on('end', function () {
    if (data) res.body = data
    this._finalize(defer, res)
  }.bind(this))
}


/**
 * Handles a failure when making the HTTP request.  The test will be failed.
 */
TestCase.prototype._handleHttpError = function (defer, e) {
  defer.reject('Request for ' + this._url + ' failed. ' + e.message)
}


/**
 * Runs the assertions against the response and marks the test as complete
 * when all promises finish.
 */
TestCase.prototype._finalize = function (defer, res) {
  var self = this
  var promise = Q(res)

  // Set up the promises.
  if (this._dump) {
    promise = promise.then(function (res) {
      self._dumpInfo(res)
      return res
    })
  }

  // Run all the evaluators in the scope of the test case.
  for (var i = 0; i < this._evaluators.length; i++) {
    promise = promise.then(function (evaluator) {
      evaluator.call(this, this._asserter, res)
      return res
    }.bind(this, this._evaluators[i]))
  }

  // Run the chained calls. The first call will get the response as its first argument.
  // The second call will get the result of the first call. And so on.
  for (i = 0; i < this._chained.length; i++) {
    promise = promise.then(function (chain, value) {
      var result = chain.call(this, value)

      // If the result is a test case, propagate the asserter and run the promise.
      if (result && (result instanceof TestCase || result.isTestCaseNodeUnitFn)) {
        result.setAsserter(this._asserter)
        return result._run()
      } else {
        return result
      }
    }.bind(this, this._chained[i]))
  }

  // When all the chained calls are done, resolve the testcase.
  promise.then(function (data) {
    defer.resolve(data)
  }).fail(function (err) {
    defer.reject(err)
  }).done()
}


/**
 * Uses a log function provided by the asserter, or else the native console.
 */
TestCase.prototype._log = function (var_args) {
  if (this._asserter.log) {
    this._asserter.log.apply(this._asserter, arguments)
  } else {
    console.log.apply(console, arguments)
  }
}


/**
 * Writes out information about the request and the response to the console.
 */
TestCase.prototype._dumpInfo = function (res) {
  this._log('  Request URL:', this._url)
  this._log('  Request Method:', this._httpMethod || 'GET')
  this._log('  Status Code:', res.statusCode)

  if (this._payload) {
    this._log('  Request Payload:')
    this._log('    ', this._payload.toString().split('\n').join('\n     '))
 }

  this._log('  Request Headers:')
  var headers = this.getHeaders()
  for (var header in headers) {
    this._log('    ', header + ':', headers[header])
  }

  this._log('  Response Headers:')
  for (var header in res.headers) {
    this._log('    ', header + ':', res.headers[header])
  }

  if (this._dumpBody && res.body) {
    this._log('  Respose Body:')
    this._log('    ', res.body.toString('utf8').split('\n').join('\n     '))
  }
}
