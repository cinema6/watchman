'use strict';

var AWS = require('aws-sdk');
var Q = require('q');
var cloudFormation = new AWS.CloudFormation({
    region: 'us-east-1'
});

module.exports = function(grunt) {
    function getStackOutputs(stack) {
        return Q.Promise(function(resolve, reject) {
            cloudFormation.describeStacks({
                StackName: stack
            }, function(error, data) {
                if(error) {
                    reject(error);
                } else {
                    resolve(data.Stacks[0].Outputs);
                }
            });
        });
    }
    
    grunt.registerMultiTask('test', 'runs tests', function() {
        var done = this.async();
        var options = this.options();
        var target = this.target;

        switch(target) {
        case 'unit':
            grunt.task.run('jasmine_nodejs:unit');
            done();
            break;
        case 'e2e':
            var cloudStack = grunt.option('formation');
            var mongoHost = options.mongoHost;
            var timeStream = options.timeStream;
            var watchmanStream = options.watchmanStream;
            
            Q.resolve().then(function() {
                if(cloudStack) {
                    return getStackOutputs(cloudStack).then(function(outputs) {
                        outputs.forEach(function(output) {
                            switch(output.OutputKey) {
                            case 'mongo':
                                mongoHost = output.OutputValue;
                                break;
                            case 'timeStream':
                                timeStream = output.OutputValue;
                                break;
                            case 'watchmanStream':
                                watchmanStream = output.OutputValue;
                                break;
                            }
                        });
                    });
                }
            }).then(function() {
                var mongoCfg = {
                    host: mongoHost,
                    port: 27017,
                    db: 'c6Db',
                    user: 'e2eTests',
                    pass: 'password'
                };
                process.env.mongo = JSON.stringify(mongoCfg);
                process.env.timeStream = timeStream;
                process.env.watchmanStream = watchmanStream;
                grunt.task.run('jasmine_nodejs:e2e');
                done();
            }).catch(function(error) {
                grunt.log.error(error);
                done(false);
            });
            break;
        }
    });
};
