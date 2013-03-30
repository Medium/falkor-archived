// Copyright 2013 The Obvious Corporation.

/**
 * @fileoverview Falkor example.
 *
 * To run the tests use:
 *    $ nodeunit example.js
 */

var falkor = require('../lib/falkor')

exports.testGoogle1 = falkor.fetch('http://google.com')
    .expectStatusCode(301)
    .expectHeader('Location', 'http://www.google.com/')

exports.testGoogle2 = falkor.fetch('http://www.google.com/')
    .expectStatusCode(200)
    .expectContentType('text/html', 'ISO-8859-1')
    .expectBodyMatches(/<title>Google<\/title>/)

// This test obviously fails, just showing you what it looks like.
exports.testNotGoogle = falkor.fetch('http://www.bing.com/')
    .expectStatusCode(200)
    .expectContentType('text/html', 'ISO-8859-1')
    .expectBodyMatches(/<title>Google<\/title>/)
    .dump()

exports.testBBC = falkor.fetch('http://www.bbc.co.uk')
    .evaluate(function (test, res) {
      test.notEqual(res.headers['date'].substr(0, 3), 'Fri', 'This evaluator fails on friday')
    })
