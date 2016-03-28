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
var Q = require('q')

// Mocks out HTTP library.  See https://github.com/flatiron/nock
var nock = require('nock')
var path = require('path')

var testJsonSchemaPath = path.join(__dirname, 'test.schema.json')
var testJsonSchemaPathToLoad = path.join(__dirname, 'testToLoad.schema.json')
var testJsonSchemaPathWithRef = path.join(__dirname, 'testWithRef.schema.json')


// Tear down after every test.
exports.tearDown = function (done) {
  falkor.setBaseUrl('')
  falkor.setRootSchemaPath('')
  nock.cleanAll()
  done()
}


// Simply tests that a request gets made to google.com and the test callback is executed.  For this
// test we don't care what happens to the response.
exports.testBasicFunctionality = falkor.fetch('http://www.google.com/')


// Tests that a failed request correctly propagates the failure and doesn't lead to a test success.
exports.testRequestFailures = function (test) {
  var mockTest = newMockTestWithExpectedFailure(test, 'Request should have failed.')
  var testFn = falkor.fetch('http://www.xtz.comx')
  testFn(mockTest)
}


// Tests that the optional setup function gets called before the test, when defined
exports.testUsingSetupWithRegularFunction = function (test) {
  var mockTest = newMockTestWithNoAssertions(test)
  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/testsetupfunction')
      .reply(200, ''))

  var setupVar = null
  var setupFn = function () {
    setupVar = 1
  }

  new falkor.TestCase('http://falkor.fake/testsetupfunction')
      .usingSetup(setupFn)
      .setAsserter(mockTest)
      .then(function() {
        test.equal(1, setupVar)
      })
      .done()
}


// Tests that the optional setup function gets called before the test, when defined
exports.testUsingSetupWithPromiseFunction = function (test) {
  var mockTest = newMockTestWithNoAssertions(test)
  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/testsetuppromise')
      .reply(200, ''))

  var setupVar = null
  var setupFn = function () {
    return Q.try(function () {
      setupVar = 1
    })
  }

  new falkor.TestCase('http://falkor.fake/testsetuppromise')
      .usingSetup(setupFn)
      .setAsserter(mockTest)
      .then(function() {
        test.equal(1, setupVar)
      })
      .done()
}


// Tests that calling 'withMethod' actually changes the HTTP Method of the generated request.
exports.testWithMethod = function (test) {
  var mockTest = newMockTestWithNoAssertions(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .post('/testmethod', '')
      .reply(200, ''))

  new falkor.TestCase('http://falkor.fake/testmethod')
      .withMethod('POST')
      .setAsserter(mockTest)
      .done()
}


// Tests that headers can be set on the request.
exports.testSettingHeaders = function (test) {
  var mockTest = newMockTestWithNoAssertions(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .matchHeader('Test-Header', 'value')
      .get('/testheaders')
      .reply(200, ''))

  new falkor.TestCase('http://falkor.fake/testheaders')
      .withHeader('Test-Header', 'value')
      .setAsserter(mockTest)
      .done()
}


// Tests that the request payload is sent with the request.
exports.testWithPayload = function (test) {
  var mockTest = newMockTestWithNoAssertions(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .post('/testpayload', 'this is a test')
      .reply(200, ''))

  new falkor.TestCase('http://falkor.fake/testpayload')
      .withMethod('POST')
      .withPayload('this is a test')
      .setAsserter(mockTest)
      .done()
}


// Tests that form encoded data is correctly escaped and the header is set.
exports.testWithFormEncodedPayload = function (test) {
  var mockTest = newMockTestWithNoAssertions(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .matchHeader('Content-Type', 'application/x-www-form-urlencoded')
      .matchHeader('Content-Length', 14)
      .post('/testformencoded', 'a=%3D%26&b=xxx')
      .reply(200, ''))

  new falkor.TestCase('http://falkor.fake/testformencoded')
      .withMethod('POST')
      .withFormEncodedPayload({a: '=&', b: 'xxx'})
      .setAsserter(mockTest)
      .done()
}


// Tests that json data is correctly serialized and the header is set.
exports.testWithJsonPayload = function (test) {
  var mockTest = newMockTestWithNoAssertions(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .matchHeader('Content-Type', 'application/json')
      .post('/testjson', '{"a":123,"b":"c"}')
      .reply(200, ''))

  new falkor.TestCase('http://falkor.fake/testjson')
      .withMethod('POST')
      .withJsonPayload({a: 123, b: 'c'})
      .setAsserter(mockTest)
      .done()
}


// Tests that cookies can be set on the request.
exports.testSetCookie = function (test) {
  var testDate = new Date('2012/12/12 12:12:12') // My bday!

  var mockTest = newMockTestWithNoAssertions(test)
  mockTest.verifyResponse(nock('http://falkor.fake')
      .matchHeader('Cookie', 'one=111; two=another-cookie; three=xxx')
      .get('/cookies')
      .reply(200, ''))

  new falkor.TestCase('http://falkor.fake/cookies')
      .withCookie('one', 111, {httpOnly: true})
      .withCookie('two', 'another-cookie', {secure: true})
      .withCookie('three', 'xxx', {expires: testDate.getTime(), path: '/cookies'})
      .setAsserter(mockTest)
      .done()
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
      .done()
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
      .done()
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
      .done()
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
      .done()
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
      .done()
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
      .done()
}


// Tests that regexp matching correctly fails if the regexp matches
exports.testExpectBodyDoesNotMatch_failureCase = function (test) {
  var mockTest = newMockTestWithSingleOkAssertion(test, false, 'Body should not have matched regex')

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/bodymatching')
      .reply(200, 'this is the response'))

  new falkor.TestCase('http://falkor.fake/bodymatching')
      .setAsserter(mockTest)
      .expectBodyDoesNotMatch(/the/)
      .done()
}


// Tests that regexp matching correctly passes if the regexp does not matches
exports.testExpectBodyDoesNotMatch_successCase = function (test) {
  var mockTest = newMockTestWithSingleOkAssertion(test, true, 'Body should not have matched regex')

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/bodymatching')
      .reply(200, 'this is the response'))

  new falkor.TestCase('http://falkor.fake/bodymatching')
      .setAsserter(mockTest)
      .expectBodyDoesNotMatch(/fish and chips/)
      .done()
}


// Tests that invalid JSON throws a failure.
exports.testJsonSchemaValidation_badJson = function (test) {
  var mockTest = newMockTestWithExpectedFailure(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/jsonschema')
      .reply(200, '{Not: "real json"}'))

  new falkor.TestCase('http://falkor.fake/jsonschema')
      .setAsserter(mockTest)
      .validateJson(testJsonSchemaPath)
      .done()
}


// Tests that JSON that doesn't match the JSON schema fails..
exports.testJsonSchemaValidation_badStructure = function (test) {
  var mockTest = newMockTestWithExpectedFailure(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/jsonschema')
      .reply(200, '{"Not": "does not match schema"}'))

  new falkor.TestCase('http://falkor.fake/jsonschema')
      .setAsserter(mockTest)
      .validateJson(testJsonSchemaPath)
      .done()
}


// Tests that JSON matching the schema passes.
exports.testJsonSchemaValidation_success = function (test) {
  var mockTest = newMockTestWithNoAssertions(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/jsonschema')
      .reply(200, '{"id": 123, "title": "Test Item", "content": "Test Content"}'))

  new falkor.TestCase('http://falkor.fake/jsonschema')
      .setAsserter(mockTest)
      .validateJson(testJsonSchemaPath)
      .done()
}


// Tests that JSON that references another schema can fail.
exports.testJsonSchemaWithRefs_badPattern = function (test) {
  var mockTest = newMockTestWithExpectedFailure(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/jsonschema')
      .reply(200, '{"id": 123, "title": "Tést Itëm", "content": { "text": "foo", "length": 3 }}'))

  new falkor.TestCase('http://falkor.fake/jsonschema')
      .setAsserter(mockTest)
      .addJsonSchema(testJsonSchemaPathToLoad)
      .validateJson(testJsonSchemaPathWithRef)
      .done()
}


// Tests that JSON that references another schema can fail.
exports.testJsonSchemaWithRefs_missingRef = function (test) {
  var mockTest = newMockTestWithExpectedFailure(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/jsonschema')
      .reply(200, '{"id": 123, "title": "Test Item", "content": { "text": "foo", "length": 3 }}'))

  new falkor.TestCase('http://falkor.fake/jsonschema')
      .setAsserter(mockTest)
      .validateJson(testJsonSchemaPathWithRef)
      .done()
}


// Tests that JSON that references another schema passes.
exports.testJsonSchemaWithRefs_success = function (test) {
  var mockTest = newMockTestWithNoAssertions(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/jsonschema')
      .reply(200, '{"id": 123, "title": "Test Item", "content": { "text": "foo", "length": 3 }}'))

  new falkor.TestCase('http://falkor.fake/jsonschema')
      .setAsserter(mockTest)
      .addJsonSchema(testJsonSchemaPathToLoad)
      .validateJson(testJsonSchemaPathWithRef)
      .done()
}


exports.testBaseUrl = function (test) {
  var mockTest = newMockTestWithNoAssertions(test)

  mockTest.verifyResponse(nock('http://some.other.url.com')
      .get('/base/url')
      .reply(200, ''))

  falkor.setBaseUrl('http://some.other.url.com/')
  new falkor.TestCase('/base/url')
      .setAsserter(mockTest)
      .done()
}


exports.testTemplates = function (test) {
  var template = falkor.newTestTemplate()
      .withMethod('put')
      .withHeader('TestHeader', '1234')
      .withPayload('data')
      .withCookie('username', 'dan')
      .expectXssiPrefix('prefix')
      .expectBodyMatches(/result/)

  var mockTest = newMockTest(function (assertions) {
    test.equals(2, assertions.length, 'There should have been two assertions')
    test.equals('prefix=prefix', assertions[0].value, 'First assertion should have checked prefix')
    test.equals('ok', assertions[1].type, '2nd assertion should have been "ok"')
    test.equals('true', assertions[1].value, '2nd assertion should have been matched "true"')
    test.done()
  })

  mockTest.verifyResponse(nock('http://falkor.fake')
      .put('/templated', 'data')
      .matchHeader('Cookie', 'username=dan')
      .matchHeader('TestHeader', '1234')
      .matchHeader('Content-Length', 4)
      .reply(200, 'prefix result'))

  template.newTestCase('http://falkor.fake/templated')
      .setAsserter(mockTest)
      .done()
}


exports.testTemplateOverrides = function (test) {
  var template = falkor.newTestTemplate()
      .withMethod('POST')
      .withHeader('TestHeader', '1234')
      .withPayload('data')
      .withCookie('username', 'dan')

  var results = []
  var mockTest = newMockTest(function (assertions) {
    results.push(assertions)
    if (results.length == 2) test.done()
  })

  mockTest.verifyResponse(nock('http://falkor.fake')
      .post('/templated', 'data')
      .matchHeader('TestHeader', '1234')
      .matchHeader('Content-Length', 4)
      .reply(200, ''))

  mockTest.verifyResponse(nock('http://falkor.fake')
      .post('/templated', 'data override')
      .matchHeader('TestHeader', '9876')
      .matchHeader('Content-Length', 13)
      .reply(200, ''))


  template.newTestCase('http://falkor.fake/templated')
      .setAsserter(mockTest)
      .done()

  template.newTestCase('http://falkor.fake/templated')
      .withHeader('TestHeader', '9876')
      .withPayload('data override')
      .setAsserter(mockTest)
      .done()
}


exports.testMixin = function (test) {
  var setupValue = 0
  var setupFunction = function () {
    setupValue = 1
  }
  var template1 = falkor.newTestTemplate()
      .usingSetup(setupFunction)
      .withMethod('put')
      .withHeader('TestHeader', '1234')
      .withPayload('data')
  var template2 = falkor.newTestTemplate()
      .withCookie('username', 'dan')
      .expectXssiPrefix('prefix')
      .expectBodyMatches(/result/)

  var mockTest = newMockTest(function (assertions) {
    test.equals(1, setupValue, 'The setup function should have executed')
    test.equals(2, assertions.length, 'There should have been two assertions')
    test.equals('prefix=prefix', assertions[0].value, 'First assertion should have checked prefix')
    test.equals('ok', assertions[1].type, '2nd assertion should have been "ok"')
    test.equals('true', assertions[1].value, '2nd assertion should have been matched "true"')
    test.done()
  })

  mockTest.verifyResponse(nock('http://falkor.fake')
      .put('/templated', 'data')
      .matchHeader('Cookie', 'username=dan')
      .matchHeader('TestHeader', '1234')
      .matchHeader('Content-Length', 4)
      .reply(200, 'prefix result'))

  falkor.fetch('http://falkor.fake/templated')
      .setAsserter(mockTest)
      .mixin(template1)
      .mixin(template2)
      .done()
}


exports.testChaining = function (test) {
  var response1 = nock('http://falkor.fake').get('/one').reply(200, 'one')
  var response2 = nock('http://falkor.fake').get('/two').reply(200, 'two')
  var response3 = nock('http://falkor.fake').get('/three').reply(200, 'three')
  var response4 = nock('http://falkor.fake').get('/four').reply(200, 'four')

  var mockTest = newMockTest(function(assertions) {
    test.equal(0, assertions.length, 'No assertions should have been run')
    response1.done()
    response2.done()
    response3.done()
    response4.done()
    test.done()
  })
  new falkor.TestCase('http://falkor.fake/one')
      .setAsserter(mockTest)
      .then(function (resp) {
        test.equal(resp.body, 'one')
        return new falkor.TestCase('http://falkor.fake/two')
      })
      .then(function (resp) {
        test.equal(resp.body, 'two')
        return falkor.fetch('http://falkor.fake/three')
            .then(function (resp) {
              test.equal(resp.body, 'three')
              return falkor.fetch('http://falkor.fake/four')
                  .then(function (resp) {
                    test.equal(resp.body, 'four')
                  })
            })
      })
      .done()
}


exports.testChainingWithOtherPromiseTypes = function (test) {
  var response1 = nock('http://falkor.fake').get('/one').reply(200, 'one')
  var response2 = nock('http://falkor.fake').get('/two').reply(200, 'two')
  var response3 = nock('http://falkor.fake').get('/three').reply(200, 'three')
  var response4 = nock('http://falkor.fake').get('/four').reply(200, 'four')

  var mockTest = newMockTest(function(assertions) {
    test.equal(0, assertions.length, 'No assertions should have been run')
    response1.done()
    response2.done()
    response3.done()
    response4.done()
    test.done()
  })
  new falkor.TestCase('http://falkor.fake/one')
      .setAsserter(mockTest)
      .then(function (resp) {
        return resp.body
      })
      .then(function (resp) {
        test.equal(resp, 'one')
        return new falkor.TestCase('http://falkor.fake/two')
        .then(function (resp) {
          return resp.body
        })
      })
      .then(function (resp) {
        test.equal(resp, 'two')
        return falkor.fetch('http://falkor.fake/three')
            .then(function (resp) {
              return Q.delay(1).thenResolve(resp.body)
            })
            .then(function (resp) {
              test.equal(resp, 'three')
              return falkor.fetch('http://falkor.fake/four')
            })
      })
      .done()
}

exports.testTimeout = function (test) {
  var response1 = nock('http://falkor.fake').get('/one').reply(200, 'one')

  var mockTest = newMockTest(function(assertions) {
    response1.done()
    test.done()
  })
  new falkor.TestCase('http://falkor.fake/one')
      .withTimeoutMs(1)
      .setAsserter(mockTest)
      .then(function (resp) {
        return Q.delay(1000)
      })
      .then(function () {
        test.fail('Expected error')
      }, function (e) {
        test.equal('Timed out after 1 ms', e.message)
      })
      .done()
}


exports.testChainingFailure = function (test) {
  var response1 = nock('http://falkor.fake').get('/one').reply(200, '')
  var response2 = nock('http://falkor.fake').get('/two').reply(500, '')

  var mockTest = newMockTest(function(assertions) {
    test.equal(1, assertions.length, 'There should have been 1 failure')
    response1.done()
    response2.done()
    test.done()
  })
  new falkor.TestCase('http://falkor.fake/one')
      .setAsserter(mockTest)
      .then(function (resp) {
        return new falkor.TestCase('http://falkor.fake/two').expectStatusCode(200)
      })
      .done()
}


exports.testChainingReject = function (test) {
  var response1 = nock('http://falkor.fake').get('/one').reply(200, '')

  var mockTest = newMockTest(function(assertions) {
    test.equal(1, assertions.length, 'There should have been 1 failure')
    response1.done()
    test.done()
  })
  new falkor.TestCase('http://falkor.fake/one')
      .setAsserter(mockTest)
      .then(function (resp) {
        return Q.reject('Expected error')
      })
      .done()
}


exports.testChainingThrow = function (test) {
  var response1 = nock('http://falkor.fake').get('/one').reply(200, '')

  var mockTest = newMockTest(function(assertions) {
    test.equal(1, assertions.length, 'There should have been 1 failure')
    response1.done()
    test.done()
  })
  new falkor.TestCase('http://falkor.fake/one')
      .setAsserter(mockTest)
      .then(function (resp) {
        throw new Error('Expected error')
      })
      .done()
}


// Tests that invalid JSON throws a failure.
exports.testJsonContentValidation_badJson = function (test) {
  var mockTest = newMockTestWithExpectedFailure(test)

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/json')
      .reply(200, '{Not: "real json"}'))

  new falkor.TestCase('http://falkor.fake/json')
      .setAsserter(mockTest)
      .evaluateWithJsonBody(function (mockTest, json) {
        test.fail('The function should not be called after JSON parsing fails.')
        // do nothing, as json parsing will fail before this function is called
      })
      .done()
}

// Tests that valid but wrong JSON throws a failure.
exports.testJsonContentValidation_wrongJson = function (test) {
  var mockTest = newMockTest(function (assertions) {
    test.equals(1, assertions.length, 'There should have been one assertion')
    test.equals('real json=real json', assertions[0].value, 'The assertion should just check if two strings are the same')
    test.done()
  })

  mockTest.verifyResponse(nock('http://falkor.fake')
      .get('/json')
      .reply(200, '{"Is": "real json"}'))

  new falkor.TestCase('http://falkor.fake/json')
      .setAsserter(mockTest)
      .evaluateWithJsonBody(function (mockTest, json) {
        mockTest.equals(json['Is'], 'real json', 'The Json object has one key "Is" -> "real json"')
      })
      .done()
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
      try {
        // Makes sure there really was a request.
        if (mockResponse) mockResponse.done()
        callback(assertions)
      } catch (e) {
        console.error(e)
        throw e
      }
    }
  }
}


// Returns a mock test object that expects no assertions to be fired.
function newMockTestWithNoAssertions(test) {
  return newMockTest(function (assertions) {
    if (assertions.length > 0) {
      test.fail('There should have been no assertions: ' + assertions[0].msg)
    }
    test.done()
  })
}


function newMockTestWithExpectedFailure(test, msg) {
  return newMockTest(function (assertions) {
    test.equals(1, assertions.length, 'There should have been one assertion')
    test.equals('fail', assertions[0].type, msg)
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
