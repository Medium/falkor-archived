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
      .reply(200, ''))

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
      .reply(200, ''))

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
      .reply(200, ''))

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
      .reply(200, ''))

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
      .reply(200, ''))

  new falkor.TestCase('http://falkor.fake/testjson')
      .withMethod('POST')
      .withJsonPayload({a: 123, b: 'c'})
      .setAsserter(mockTest)
      .run()
}


// Tests that cookies can be set on the request.
exports.testSetCookie = function (test) {
  var testDate = new Date('2012/12/12 12:12:12') // My bday!

  var mockTest = newMockTestWithNoAssetions(test)
  mockTest.verifyResponse(nock('http://falkor.fake')
      .matchHeader('Cookie', 'one=111; two=another-cookie; three=xxx')
      .get('/cookies')
      .reply(200, ''))

  new falkor.TestCase('http://falkor.fake/cookies')
      .withCookie('one', 111, {httpOnly: true})
      .withCookie('two', 'another-cookie', {secure: true})
      .withCookie('three', 'xxx', {expires: testDate.getTime(), path: '/cookies'})
      .setAsserter(mockTest)
      .run()
}


// Tests that evaluators are called and their assertions are recorded.
exports.testBasicEvaluators = function (test) {
  var mockTest = newMockTest(function (assertions) {
    test.equals(2, assertions.length, 'There should have been two assertions')
    test.equals('1=1', assertions[0].value, 'First assertion should have compared 1 to 1')
    test.equals('true', assertions[1].value, 'Second assertion should just check for true')
    test.done()
  })

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/evaluators')
      .reply(200, ''))

  new falkor.TestCase('http://falkor.fake/evaluators')
      .setAsserter(mockTest)
      .evaluate(function (mockTest, res) {
        mockTest.equals(1, 1, 'Just testing assertions')
      })
      .evaluate(function (mockTest, res) {
        mockTest.ok(!!res, 'Response should exist')
      })
      .run()
}


// Tests that adding the expectStatusCode evaluator asserts the response has the right status code.
exports.testExpectStatusCode = function (test) {
  var mockTest = newMockTestWithSingleEqualsAssertion(
    test, '403=401', 'Assertion should have compared status codes')

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/status')
      .reply(403, ''))

  new falkor.TestCase('http://falkor.fake/status')
      .setAsserter(mockTest)
      .expectStatusCode(401)
      .run()
}


// Tests that adding the expectHeader evaluator asserts the response has the right headers.
exports.testExpectHeader = function (test) {
  var mockTest = newMockTestWithSingleEqualsAssertion(
    test, 'FakeServer=Apache', 'Assertion should have compared headers')

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/headers')
      .reply(200, '', {'Server': 'FakeServer'}))

  new falkor.TestCase('http://falkor.fake/headers')
      .setAsserter(mockTest)
      .expectHeader('Server', 'Apache')
      .run()
}


// Tests that adding content type expectations matches header properly..
exports.testExpectContentType = function (test) {
  var ct = 'text/gibberish; charset=exotic'

  var mockTest = newMockTestWithSingleEqualsAssertion(
    test, ct + '=' + ct, 'Assertion should check the content type')

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/contenttype')
      .reply(200, '', {'Content-Type': ct}))

  new falkor.TestCase('http://falkor.fake/contenttype')
      .setAsserter(mockTest)
      .expectContentType('text/gibberish', 'exotic')
      .run()
}


// Tests that a reg exp expectation correctly fires the assertion with false if it doens't exist.
exports.testExpectBodyMatches_failureCase = function (test) {
  var mockTest = newMockTestWithSingleOkAssertion(test, false, 'Body should not have matched regex')

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/bodymatching')
      .reply(200, 'this is the response'))

  new falkor.TestCase('http://falkor.fake/bodymatching')
      .setAsserter(mockTest)
      .expectBodyMatches(/fish and chips/)
      .run()
}


// Tests that a regexp expectation correctly matches the content if it exists.
exports.testExpectBodyMatches_successCase = function (test) {
  var mockTest = newMockTestWithSingleOkAssertion(test, true, 'Body should have matched regex')

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/bodymatching')
      .reply(200, 'this is the response with fish and chips'))

  new falkor.TestCase('http://falkor.fake/bodymatching')
      .setAsserter(mockTest)
      .expectBodyMatches(/fish and chips/)
      .run()
}


// Creates a mock test object that records the assertions that were executed on it.
function newMockTest(callback) {
  var assertions = []
  var mockResponse = null
  return {
    verifyResponse: function (resp) {
      mockResponse = resp
    },
    ok: function (value, msg) {
      assertions.push({type: 'ok', value: String(value), msg: msg})
    },
    equals: function (a, b, msg) {
      assertions.push({type: 'equals', value: a + '=' + b, msg: msg})
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


function newMockTestWithSingleEqualsAssertion(test, value, msg) {
  return newMockTest(function (assertions) {
    test.equals(1, assertions.length, 'There should have been one assertion')
    test.equals(value, assertions[0].value, msg)
    test.done()
  })
}


function newMockTestWithSingleOkAssertion(test, value, msg) {
  return newMockTest(function (assertions) {
    test.equals(1, assertions.length, 'There should have been one assertion')
    test.equals(String(value), assertions[0].value, msg)
    test.done()
  })
}
