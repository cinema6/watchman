'use strict';

var AWS = require('aws-sdk');
var Q = require('q');
var program = require('commander');

var DEFAULT_STREAM_NAMES = ['e2eTimeStream', 'e2eWatchmanStream'];
var DEFAULT_DESCRIBE_WAIT_TIME = 5000;

var kinesis = new AWS.Kinesis({region : 'us-east-1'});

function createStream(streamName, numShards) {
    return Q.Promise(function(resolve, reject) {
        kinesis.createStream({
            StreamName: streamName,
            ShardCount: numShards
        }, function(error, data) {
            if(error) {
                reject(error);
            } else {
                resolve(data);
            }
        });
    });
}

function describeStream(streamName) {
    return Q.Promise(function(resolve, reject) {
        kinesis.describeStream({StreamName: streamName}, function(error, data) {
            if(error) {
                reject(error);
            } else {
                resolve(data);
            }
        });
    });
}

function streamActive(streamName) {
    return describeStream(streamName).then(function(data) {
        var status = data.StreamDescription.StreamStatus;
        return (status === 'ACTIVE');
    });
}

function streamExists(streamName) {
    return describeStream(streamName).then(function() {
        return true;
    }).catch(function(error) {
        return (error.code === 'ResourceNotFoundException') ? false : Q.reject(error);
    });
}

function waitForActiveStream(streamName, waitTime) {
    return describeStream(streamName).then(function() {
        return streamActive(streamName).then(function(active) {
            if(!active) {
                return Q.Promise(function(resolve, reject) {
                    setTimeout(function() {
                        waitForActiveStream(streamName).then(resolve, reject);
                    }, waitTime);
                });
            }
        });
    });
}

function createStreams(streamNames, waitTime) {
    console.log('Creating streams ' + streamNames);
    return Q.allSettled(streamNames.map(function(streamName) {
        return streamExists(streamName).then(function(exists) {
            if(exists) {
                return Q.reject(streamName + ' already exists');
            }
        }).then(function() {
            return createStream(streamName, 1);
        }).then(function() {
            return waitForActiveStream(streamName, waitTime);
        });
    })).then(function(results) {
        results.forEach(function(result, index) {
            if(result.state === 'fulfilled') {
                console.log(streamNames[index], 'is ready');
            } else {
                var reason = result.reason;
                console.error('Error creating stream ' + streamNames[index] + ': ' + reason);
            }
        });
    });
}

function parseArgs() {
    function parseList(csvStr) {
        return csvStr.split(',');
    }
    
    function parseInteger(intStr) {
        return parseInt(intStr);
    }
    
    program
        .option('-s, --streams <stream list>', 'comma separated list of streams', parseList,
            DEFAULT_STREAM_NAMES)
        .option('-w, --wait [wait time]', 'time to wait between stream status checks',
            parseInteger, DEFAULT_DESCRIBE_WAIT_TIME)
        .parse(process.argv);

    return {
        streams: program.streams,
        waitTime: program.wait
    };
}

function run() {
    var options = parseArgs();
    createStreams(options.streams, options.waitTime);
}

run();
