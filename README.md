Falkor
======

[![Build Status](https://secure.travis-ci.org/Obvious/falkor.png)](http://travis-ci.org/Obvious/falkor)

A HTTP level functional testing library using [nodejs](http://nodejs.org) and
[nodeunit](https://github.com/caolan/nodeunit).

1. Declaratively set request properties including headers and cookies.
2. Easily send form-encoded data, JSON, or plain text.
3. Use predefined evaluators to set expectations on the response.
4. Use JSON-Schema to validate JSON.
5. Write custom evaluators to do more advanced processing and validation.

Suggested uses:

1. Testing REST API end-points.
2. Functional testing of the application layer.
3. Automated smoke tests.
4. Probers.

Install
-------

```
$ npm install falkor
$ npm test falkor
```

Usage
-----

The main interface in Falkor is `falkor.fetch`.  It returns a nodeunit compatible function with
extra methods hanging off it that can be used to define behavior and set expectations.

To create test cases simply write a nodeunit test file and use falkor to define test methods, e.g.:

```
var falkor = require('falkor')

exports.testGoogle = falkor.fetch('http://google.com')
    .expectStatusCode(301)
    .expectHeader('Location', 'http://www.google.com/')
    .dump() // Not necessary, but useful for debugging.
```

Then to run the tests you can either use nodeunit or the test runner included with falkor.  The
falkor test runner is new as of `v1.2.0`, the main difference being that tests will be run in
parallel.

```
nodeunit mytest.js
node_modules/.bin/falkor mytest.js
```

See the `examples` folder for a few other examples.

Changes
-------

Head on over to the wiki to see [what changed](https://github.com/Obvious/falkor/wiki/Change-Log)
between NPM package versions.

Reference
---------

As mentioned about the primary way to use Falkor is via the `falkor.fetch` method.  If you do
nothing else the URL will be fetched via a GET request when the test is run.  The test will pass --
regardless of HTTP response -- unless there is a network level failure.

You build up the test by specifying extra information about how the request should be made and then
by defining expectations for the response.  If the actual response deviates from expectations the
tests will fail.

### Configuring the request

#### .withMethod(httpMethod)

Specifies the HTTP method to use when making the request.

#### .withHeader(name, value)

Sets a HTTP request header.  Can be called multiple times to set multiple headers.

#### .setContentType(contentType)

Short-cut for setting the Content-Type header of the request.  Note, that on its own this doesn't
change how the request payload will be sent.  See `withPayload`, `withFormEncodedPayload` and
`withJsonPayload`.

#### .withCookie(name, value)

Helper for setting the cookie header.  Can be called multiple times to set multiple cookies.

#### .withPayload(bufferOrUtf8String)

Specifies the request payload.  It can be either a `Buffer` or a string.  Strings are assumed to be
UTF-8.  The payload will be sent regardless of HTTP method.  The Content-Length header will also be
set accordingly.

#### .withFormEncodedPayload(object)

Sets the request payload to be a form-encoded string based on the keys/values in the passed in
object.  This method will also set the Content-Type header to `application/x-www-form-urlencoded`.

#### .withJsonPayload(object)

Sets the request payload to be a JSON string.  This method will also set the Content-Type header to
`application/json`.


### Setting expectations

#### .expectStatusCode(statusCode)

Fails the test if the response doesn't have a specific status code.

#### .expectHeader(name, value)

Fails the test if the response doesn't have a header with a specific value.  Can be specified
multiple times.

#### .expectContentType(contentType, opt_charset)

Shortcut for asserting the content type matches.

#### .expectPlainText()

Shortcut for `expectHeader('Content-Type', 'text/plain')`.

#### .expectHtml()

Shortcut for `expectHeader('Content-Type', 'text/html')`.

#### .expectJson()

Shortcut for `expectHeader('Content-Type', 'application/json')`.

#### .expectHtmlWithCharset(opt_charset)

Same as `expectHtml` but expects the charset to be set as well, defaults to wanting UTF-8.

#### .expectJsonWithCharset(opt_charset)

Same as `expectJson` but expects the charset to be set as well, defaults to wanting UTF-8.

#### .expectBodyMatches(regExp)

Fails the test if the response body *doesn't* match the provided regular expression.

#### .expectBodyDoesNotMatch(regExp)

Fails the test if the response body *does* match the provided regular expression.

#### .expectXssiPrefix(prefix)

Fails the test if the response body doesn't begin with the provided XSSI prefix. The prefix will
also be stripped before the response body is parsed as JSON.

#### .addJsonSchema(schemaPath)

Adds a JSON schema (or an array of JSON schema) to be used later by $ref links in validateJson().
Every schema added using this method needs to have an id property.

#### .validateJson(schemaPath)

Validates the response body against a JSON schema.  The validator is taken from the Chromium project
and implements a subset of the official spec.  See the file header in lib/json-schema/json-schema.js
for exact details on what is supported.

#### .evaluate(fn)

Adds an evaluator function that will be executed against the response.  The evaluator is passed the
nodeunit test object, which can be used for executing assertions, and the response object.

Use this method if none of the built in evaluators do quite what you want.

For example:

```
exports.testBBC = falkor.fetch('http://www.bbc.co.uk')
    .evaluate(function (test, res) {
      test.notEqual(res.headers['date'].substr(0, 3), 'Fri', 'This evaluator fails on Friday.')
    })
```


### Other things

#### .dump(opt_dumpBody)

Logs out information about the request and response to the console.  Depending on what you are
requesting this can be quite noisy.  It is recommended you use it for debugging only.  By default
doesn't log response body.

#### .setAsserter()

By default Falkor uses the nodeunit test object to execute assertions on.  In some cases you might
want to provide your own assertion object, but make sure to support the full interface.

If you want to use Falkor without nodeunit the best way is to construct and run a TestCase directly:

```
new falkor.TestCase(url)
    .withMethod('POST')
    .expectBodyMatches(/fish and chips/)
    .setAsserter(customAsserter)
    .run()
```

#### falkor.setBaseUrl(url)

Sets the base URL from which other URLs are resolved.  This still allows you to specify absolute
URLs in specific test methods but relative URLs will be resolved accordingly.

#### falkor.setRootSchemaPath(path)

Sets the base path for where schemas should be resolved from.  e.g. to avoid having to specify
`path.join(__dirname, 'some-schema.json')` repeatedly.

#### falkor.newTestTemplate()

A Test Template allows you to set up a set of configuration options and expectations that can then
be shared by multiple test cases.  Instead of calling `falkor.fetch(url)` to generate a test case
you call `template.fetch(url)` and the test case will inherit options from the template.

Example:

```
var formTest = falkor.newTestTemplate()
    .withMethod('POST')
    .withFormEncodedPayload(frmData)

exports.testFormRequiresLogin_noCookies = formTest.fetch('/form')
    .expectStatusCode(401)

exports.testFormRequiresLogin_withCookies = formTest.fetch('/form')
    .withCookie('auth_token', 'abce114f')
    .expectStatusCode(200)
```

### Node unit quick reference

Especially helpful if you are writing your own evaluator functions or asserter:

```
ok(value, [message]) - Tests if value is a true value.
equal(actual, expected, [message]) - Tests shallow ( == ).
notEqual(actual, expected, [message]) - Tests shallow ( != ).
deepEqual(actual, expected, [message]) - Tests for deep equality.
notDeepEqual(actual, expected, [message]) - Tests for any deep inequality.
strictEqual(actual, expected, [message]) - Tests strict equality ( === ).
notStrictEqual(actual, expected, [message]) - Tests strict non-equality ( !== ).
throws(block, [error], [message]) - Expects block to throw an error.
doesNotThrow(block, [error], [message]) - Expects block not to throw an error.
ifError(value) - Tests if value is not a false value, throws if it is a true value.
```

Testing
-------

Falkor unit tests of course use nodeunit and can be found in `tests/falkor_test.js`.
[Nock](http://github.com/flatiron/nock) is used to mock out the HTTP requests.

```
$ npm test # or
$ nodeunit tests/falkor_test.js
```

Contributing
------------

Questions, comments, bug reports, and pull requests are all welcome.  Submit them at
[the project on GitHub](https://github.com/Obvious/falkor/).  If you haven't contributed to an
[Obvious](http://github.com/Obvious/) project before please head over to the
[Open Source Project](https://github.com/Obvious/open-source#note-to-external-contributors) and fill
out an OCLA (it should be pretty painless).

Bug reports that include steps-to-reproduce (including code) are the
best. Even better, make them in the form of pull requests.

Author
------

[Dan Pupius](https://github.com/dpup)
([personal website](http://pupius.co.uk/)), supported by
[The Obvious Corporation](http://obvious.com/).

License
-------

Copyright 2012 [The Obvious Corporation](http://obvious.com/).

Licensed under the Apache License, Version 2.0.
See the top-level file `LICENSE.txt` and
(http://www.apache.org/licenses/LICENSE-2.0).
