#!/usr/bin/env node

// Copyright 2013 The Obvious Corporation.

/**
 * @fileoverview Standalone test runner for falkor tests.
 *
 * Usage:
 *   ./runner.js [test1.js] [test2.js]
 *   OR
 *   ./runner.js --baseUrl=yahoo.com -- [test1.js] [test2.js]
 */

var colors = require('colors')
var path = require('path')
var Q = require('q')
var Asserter = require('../lib/asserter')
var falkor = require('falkor')
var flags = require('flags')

flags.defineString('baseUrl', '', 'The base URL for sending requests')

// For backwards compatibility.
var firstArg = process.argv[2]
if (firstArg.indexOf('--') != 0) {
  process.argv.splice(2, 0, '--')
}

var testFiles = flags.parse()

if (process.env['FALKOR_SOCKETS']) {
  var numSockets = Number(process.env['FALKOR_SOCKETS'])
  console.log('Number of sockets:', numSockets)
  require('http').globalAgent.maxSockets = numSockets
  require('https').globalAgent.maxSockets = numSockets
}

var promises = []
var results = []
var startTime = Date.now()

if (flags.get('baseUrl')) {
  falkor.setBaseUrl(flags.get('baseUrl'))
}

for (var i = 0; i < testFiles.length; i++) {
  var test = require(path.join(process.cwd(), testFiles[i]))
  for (var key in test) {
    promises.push(runTest(testFiles[i], key, test[key]))
  }
}

console.log(promises.length + ' test cases discovered, in ' + testFiles.length + ' files.')

var timeout = setTimeout(function () {
  console.error('Tests timed out, maybe test.done() was not called.')
  process.exit(1)
}, 90000)

Q.all(promises).then(function () {
  clearTimeout(timeout)
  var time = ' (' + (Date.now() - startTime) + 'ms)'
  if (results.length) {
    console.log(('FINISHED WITH ' + results.length + ' FAILURES').red + time)
    process.exit(1)
  } else {
    console.log('No errors, good job!'.green + time)
  }
})

function runTest(file, name, testCase) {
  var deferred = Q.defer()
  var asserter = new Asserter(function (errors, logs) {
    if (errors.length) {
      console.log('FAILURE'.red, file, name)
      errors.forEach(function (error) {
        console.log(error.message)
      })
      results.push({file: file, name: name, errors: errors})
    } else {
      console.log('SUCCESS'.green, file, name)
    }
    if (logs.length) {
      console.log('Log Lines:')
      logs.forEach(function (line) {
        console.log.apply(console, line)
      })
      console.log('---')
    }
    deferred.resolve(true)
  })
  testCase(asserter)
  return deferred.promise
}
