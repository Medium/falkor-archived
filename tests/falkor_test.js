// Copyright 2012 The Obvious Corporation.

/**
 * @fileoverview Tests for Falkor.
 *
 * Some of these tests might be kind of strange at first sight, so I'll offer some explanation.
 * The result of calling Falkor is a node-unit test function that has helpers hanging of it that can
 * be used to change the behavior and expectations of the requests.  As such many of these tests
 * use falkor to create a test function then pass a mock-test object to the test function to
 * simulate nodeunit running the test.
 *
 * In order to avoid making real HTTP request "nock" is used to intercepts requests. It works by
 * overriding http.request and intercepting outgoing requests for a certain host, and failing if the
 * requests don't match the expectations that have been set.
 *
 */

var falkor = require('../lib/falkor')

// Mocks out HTTP library.  See https://github.com/flatiron/nock
var nock = require('nock')


// Tear down after every test.
exports.tearDown = function (done) {
  nock.cleanAll()
  done()
}


// Simply tests that a request gets made to google.com and the test callback is executed.  For this
// test we don't care what happens to the response.
exports.testBasicFunctionality = falkor.fetch('http://www.google.com/')


// Tests that a failed request correctly propagates the failure and doesn't lead to a test success.
exports.testRequestFailures = function (test) {
  var mockTest = newMockTest(function (assertions) {
    if (assertions.length != 1) test.fail('There should have been one assertion.')
    else if (assertions[0].type != 'fail') test.fail('Assertion should have been a "fail".')
    test.done()
  })

  var testFn = falkor.fetch('http://www.xtz.comx')

  testFn(mockTest)
}


// Tests that calling 'withMethod' actually changes the HTTP Method of the generated request.
exports.testWithMethod = function (test) {
  var mockTest = newMockTestWithNoAssetions(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .post('/testmethod', '')
      .reply(200, {data: ''}))

  new falkor.TestCase('http://falkor.fake/testmethod')
      .withMethod('POST')
      .setAsserter(mockTest)
      .run()
}


// Tests that headers can be set on the request.
exports.testSettingHeaders = function (test) {
  var mockTest = newMockTestWithNoAssetions(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .matchHeader('Test-Header', 'value')
      .get('/testheaders')
      .reply(200, {data: ''}))

  new falkor.TestCase('http://falkor.fake/testheaders')
      .withHeader('Test-Header', 'value')
      .setAsserter(mockTest)
      .run()
}


// Tests that the request payload is sent with the request.
exports.testWithPayload = function (test) {
  var mockTest = newMockTestWithNoAssetions(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .post('/testpayload', 'this is a test')
      .reply(200, {data: ''}))

  new falkor.TestCase('http://falkor.fake/testpayload')
      .withMethod('POST')
      .withPayload('this is a test')
      .setAsserter(mockTest)
      .run()
}


// Tests that form encoded data is correctly escaped and the header is set.
exports.testWithFormEncodedPayload = function (test) {
  var mockTest = newMockTestWithNoAssetions(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .matchHeader('Content-Type', 'application/x-www-form-urlencoded')
      .post('/testformencoded', 'a=%3D%26&b=xxx')
      .reply(200, {data: ''}))

  new falkor.TestCase('http://falkor.fake/testformencoded')
      .withMethod('POST')
      .withFormEncodedPayload({a: '=&', b: 'xxx'})
      .setAsserter(mockTest)
      .run()
}


// Tests that json data is correctly serialized and the header is set.
exports.testWithJsonPayload = function (test) {
  var mockTest = newMockTestWithNoAssetions(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .matchHeader('Content-Type', 'application/json')
      .post('/testjson', '{"a":123,"b":"c"}')
      .reply(200, {data: ''}))

  new falkor.TestCase('http://falkor.fake/testjson')
      .withMethod('POST')
      .withJsonPayload({a: 123, b: 'c'})
      .setAsserter(mockTest)
      .run()
}


// Creates a mock test object.
function newMockTest(callback) {
  var assertions = []
  var mockResponse = null
  return {
    verifyResponse: function (resp) {
      mockResponse = resp
    },
    fail: function (msg) {
      assertions.push({type: 'fail', msg: msg})
    },
    done: function () {
      // Makes sure there really was a request.
      if (mockResponse) mockResponse.done()
      callback(assertions)
    }
  }
}


// Returns a mock test object that expects no assertions to be fired.
function newMockTestWithNoAssetions(test) {
  return newMockTest(function (assertions) {
    test.equals(0, assertions.length, 'There should have been no assertions')
    test.done()
  })
}
