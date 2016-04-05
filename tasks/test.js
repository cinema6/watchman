'use strict';

var AWS = require('aws-sdk');
var Q = require('q');
var fs = require('fs');
var path = require('path');

module.exports = function(grunt) {
    var cloudFormation;

    function initCloudFormation(auth, region) {
        AWS.config.loadFromPath(auth);
        AWS.config.update({ region: region });
        cloudFormation = new AWS.CloudFormation();
    }

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
            var appKey = grunt.option('appKey');
            var appSecret = grunt.option('appSecret');
            var auth = grunt.option('awsAuth') || path.join(process.env.HOME, '.aws.json');
            var cloudStack = grunt.option('formation');
            var region = grunt.option('region') || 'us-east-1';
            var timeStream = options.timeStream;
            var watchmanStream = options.watchmanStream;
            var cwrxStream = options.cwrxStream;
            var mongoHost = grunt.option('dbHost') || options.mongoHost;

            initCloudFormation(auth, region);

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
                            case 'cwrxStream':
                                cwrxStream = output.OutputValue;
                                break;
                            }
                        });
                    });
                }
            }).then(function() {
                var appCreds;
                try {
                    appCreds = grunt.file.readJSON('.rcAppCreds.json');
                } catch(error) {
                    appCreds = {
                        key: appKey,
                        secret: appSecret
                    };
                }
                var mongoCfg = {
                    host: mongoHost,
                    port: 27017,
                    db: 'c6Db',
                    user: 'e2eTests',
                    pass: 'password'
                };
                process.env.appCreds = JSON.stringify(appCreds);
                try {
                    var credsPath = path.join(process.env.HOME,'.aws.json');
                    process.env.awsCreds = fs.readFileSync(credsPath, {
                        encoding: 'utf-8'
                    });
                } catch (error) {
                    process.env.awsCreds = null;
                }
                process.env.mongo = JSON.stringify(mongoCfg);
                process.env.timeStream = timeStream;
                process.env.watchmanStream = watchmanStream;
                process.env.cwrxStream = cwrxStream;
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
