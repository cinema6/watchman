'use strict';

var AWS = require('aws-sdk');
var Q = require('q');
var program = require('commander');

var DEFAULT_STREAM_NAMES = ['e2eTimeStream', 'e2eWatchmanStream'];
var DEFAULT_TABLE_NAMES = ['e2eTimeStreamApplication', 'e2eWatchmanStreamApplication'];
var DEFAULT_DESCRIBE_WAIT_TIME = 5000;

var kinesis = new AWS.Kinesis({region : 'us-east-1'});
var dynamo = new AWS.DynamoDB({region : 'us-east-1'});

function deleteStream(streamName) {
    return Q.Promise(function(resolve, reject) {
        kinesis.deleteStream({StreamName: streamName}, function(error, data) {
            if(error) {
                reject(error);
            } else {
                resolve(data);
            }
        });
    });
}

function deleteTable(tableName) {
    return Q.Promise(function(resolve, reject) {
        dynamo.deleteTable({TableName: tableName}, function(error, data) {
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

function describeTable(tableName) {
    return Q.Promise(function(resolve, reject) {
        dynamo.describeTable({TableName: tableName}, function(error, data) {
            if(error) {
                reject(error);
            } else {
                resolve(data);
            }
        });
    });
}

function streamExists(streamName) {
    return describeStream(streamName).then(function() {
        return true;
    }).catch(function(error) {
        return (error.code === 'ResourceNotFoundException') ? false : Q.reject(error);
    });
}

function tableExists(tableName) {
    return describeTable(tableName).then(function() {
        return true;
    }).catch(function(error) {
        return (error.code === 'ResourceNotFoundException') ? false : Q.reject(error);
    });
}

function ensureStreamDeleted(streamName, waitTime) {
    return streamExists(streamName).then(function(exists) {
        if(exists) {
            return Q.Promise(function(resolve, reject) {
                setTimeout(function() {
                    ensureStreamDeleted(streamName).then(resolve, reject);
                }, waitTime);
            });
        }
    });
}

function ensureTableDeleted(tableName) {
    return Q.Promise(function(resolve, reject) {
        dynamo.waitFor('tableNotExists', {TableName: tableName}, function(error, data) {
            if(error) {
                reject(error);
            } else {
                resolve(data);
            }
        });
    });
}

function deleteStreams(streamNames, waitTime) {
    console.log('Deleting streams ' + streamNames);
    return Q.allSettled(streamNames.map(function(streamName) {
        return streamExists(streamName).then(function(exists) {
            if(exists) {
                return deleteStream(streamName).then(function() {
                    return ensureStreamDeleted(streamName, waitTime);
                });
            }
        });
    })).then(function(results) {
        results.forEach(function(result, index) {
            if(result.state === 'fulfilled') {
                console.log(streamNames[index], 'is deleted');
            } else {
                var reason = result.reason;
                console.error('Error deleting stream ' + streamNames[index] + ': ' + reason);
            }
        });
    });
}

function deleteTables(tableNames) {
    console.log('Deleting tables ' + tableNames);
    return Q.allSettled(tableNames.map(function(tableName) {
        return tableExists(tableName).then(function(exists) {
            if(exists) {
                return deleteTable(tableName).then(function() {
                    return ensureTableDeleted(tableName);
                });
            }
        });
    })).then(function(results) {
        results.forEach(function(result, index) {
            if(result.state === 'fulfilled') {
                console.log(tableNames[index], 'is deleted');
            } else {
                var reason = result.reason;
                console.error('Error deleting table ' + tableNames[index] + ': ' + reason);
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
        .option('-t, --tables <table list>', 'comma separated list of tables', parseList,
            DEFAULT_TABLE_NAMES)
        .option('-w, --wait [wait time]', 'time to wait between stream status checks',
            parseInteger, DEFAULT_DESCRIBE_WAIT_TIME)
        .parse(process.argv);

    return {
        streams: program.streams,
        tables: program.tables,
        waitTime: program.wait
    };
}

function run() {
    var options = parseArgs();
    deleteStreams(options.streams, options.waitTime).then(function() {
        return deleteTables(options.tables);
    });
}

run();
