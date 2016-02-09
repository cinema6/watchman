
'use strict';

var AWS = require('aws-sdk');
var Q = require('q');

module.exports = function(grunt) {
    var kinesis = new AWS.Kinesis({region : 'us-east-1'});
    var dynamo = new AWS.DynamoDB({region : 'us-east-1'});

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

    function tableExists(tableName) {
        return describeTable(tableName).then(function() {
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

    grunt.registerMultiTask('streams', 'controls Kinesis e2e streams', function() {
        var done = this.async();
        var options = this.options({
            waitTime: 5000,
            streams: ['e2eTimeStream', 'e2eWatchmanStream'],
            tables: ['e2eTimeStreamApplication', 'e2eWatchmanStreamApplication']
        });
        var target = this.target;

        switch(target) {
        case 'create':
            createStreams(options.streams, options.waitTime).then(function() {
                done(true);
            }).catch(function() {
                done(false);
            });
            break;
        case 'destroy':
            deleteStreams(options.streams, options.waitTime).then(function() {
                return deleteTables(options.tables);
            }).then(function() {
                done(true);
            }).catch(function() {
                done(false);
            });
            break;
        default:
            done(false);
        }
    });
};
