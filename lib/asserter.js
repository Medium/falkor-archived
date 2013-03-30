// Copyright 2013 The Obvious Corporation.

/**
 * @fileoverview Asserter object used by Falkor's standalone test runner.
 * Should be API compatible with the nodeunit test object.
 *
 *   done() - Called by test case when it succeeds.
 *   fail([message]) - Called by test case when there is a failure.
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
 */

var assert = require('assert')
var util = require('util')


/**
 * @param {function (Array.<Error>, Array.<string>)} callback Function called
 *     when testcase is complete.
 * @constructor
 */
function Asserter(callback) {
  this._callback = callback

  // TODO(dan): Wrapping native asserts is easy but doesn't give as much
  // information about failures as I would like.

  this._wrapNativeAssert('ok')
  this._wrapNativeAssert('equal')
  this._wrapNativeAssert('equal', 'equals')
  this._wrapNativeAssert('notEqual')
  this._wrapNativeAssert('deepEqual')
  this._wrapNativeAssert('notDeepEqual')
  this._wrapNativeAssert('strictEqual')
  this._wrapNativeAssert('throws')
  this._wrapNativeAssert('doesNotThrow')
  this._wrapNativeAssert('ifError')

  this._errors = []
  this._logs = []
  this._finished = false
}
module.exports = Asserter


/**
 * Fails the test with the provided message.
 * @param {string} message
 */
Asserter.prototype.fail = function (message) {
  if (this._finished) return
  this._finished = true
  this._errors.push(new Error(message))
  this._callback.call(null, this._errors, this._logs)
}


/**
 * Indicates the test case is complete.
 */
Asserter.prototype.done = function () {
  if (this._finished) return
  this._finished = true
  this._callback.call(null, this._errors, this._logs)
}

/**
 * Associates log lines with this set of assertions
 * @param {*} var_args
 */
Asserter.prototype.log = function (var_args) {
  this._logs.push(arguments)
}


Asserter.prototype._wrapNativeAssert = function (method, opt_alias) {
  if (this._finished) return
  var alias = opt_alias || method
  this[alias] = function () {
    try {
      assert[method].apply(assert, arguments)
    } catch (e) {
      this._errors.push(e)
    }
  }
}


