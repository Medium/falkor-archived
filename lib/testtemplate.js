// Copyright 2012 The Obvious Corporation.

/**
 * @fileoverview Test template class for building Test Cases with common configurations.
 */

var util = require('util')

var Options = require('./options')
var TestCase = require('./testcase')



/**
 * @constructor
 */
function TestTemplate() {
  TestTemplate.super_.call(this)
}
util.inherits(TestTemplate, Options)
module.exports = TestTemplate


/**
 * Returns a new nodeunit compatible function.
 * @param {string} url
 * @return {function (!Object)}
 */
TestTemplate.prototype.fetch = function (url) {
  return this.newTestCase(url).toNodeUnitFn()
}


/**
 * Creates a new test case using this template as a base for the options.
 * @param {string} url
 * @return {TestCase}
 */
TestTemplate.prototype.newTestCase = function (url) {
  var testCase = new TestCase(url)
  testCase._copy(this)
  return testCase
}


/**
 * Creates a new test template using this one as a base.
 * @return {TestTemplate}
 */
TestTemplate.prototype.clone = function () {
  var testTemplate = new TestTemplate()
  testTemplate._copy(this)
  return testTemplate
}
