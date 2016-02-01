'use strict';

var KclApp;
var fs = require('fs');
var logger = require('../../lib/logger.js');
var proxyquire = require('proxyquire').noCallThru();

describe('KclApp.js', function() {
    var app;
    var config;
    var mockKcl;
    var runSpy;
    var mockEventProcessor;
    var mockRecordProcessor;
    var mockLog;
    
    beforeEach(function() {
        config = {
            java: {
                jarPath: '/valid-dir',
                path: '/valid-file'
            },
            kinesis: {
                pidPath: '/valid-dir',
                consumers: [
                    {
                        appName: 'appName',
                        processor: 'ValidProcessor.js',
                        properties: '/valid-file'
                    },
                    {
                        appName: 'appName',
                        processor: 'ValidProcessor.js',
                        properties: '/valid-file'
                    }
                ],
                watchmanProducer: {
                    stream: 'streamName',
                    region: 'regionName'
                }
            },
            eventProcessors: {
                time: {
                    pulse: {
                        actions: ['valid_action']
                    }
                },
                cwrx: {
                    evnt: {
                        actions: [
                            {
                                name: 'valid_action'
                            }
                        ]
                    }
                }
            },
            log: { },
            secrets: '/valid-file-secrets'
        };
        runSpy = jasmine.createSpy('run()');
        mockKcl = jasmine.createSpy('kcl').and.returnValue({
            run: runSpy
        });
        mockEventProcessor = jasmine.createSpy('mockEventProcessor()');
        mockRecordProcessor = jasmine.createSpy('mockRecordProcessor()');
        mockLog = {
            trace: jasmine.createSpy('trace()'),
            info: jasmine.createSpy('info()'),
            warn: jasmine.createSpy('warn()'),
            error: jasmine.createSpy('error()')
        };
        KclApp = proxyquire('../../src/KclApp.js', {
            'mockConfig': config,
            'aws-kcl': mockKcl,
            './event_processors/ValidProcessor.js': mockEventProcessor,
            './record_processors/RecordProcessor.js': mockRecordProcessor,
            '/valid-file-secrets': 'so secret'
        });
        app = new KclApp();
        spyOn(fs, 'writeFileSync');
        spyOn(fs, 'unlinkSync');
        spyOn(app, 'parseCmdLine');
        spyOn(app, 'writePid');
        spyOn(app, 'removePid');
        spyOn(logger, 'createLog').and.returnValue(mockLog);
        spyOn(process, 'on');
        spyOn(process, 'exit');
    });
    
    describe('writePid', function() {
        beforeEach(function() {
            app.writePid.and.callThrough();
            app.writePid('path');
        });

        it('should write the pid to a file', function() {
            expect(fs.writeFileSync).toHaveBeenCalledWith('path', process.pid.toString());
        });
    });
    
    describe('removePid', function() {
        beforeEach(function() {
            app.removePid.and.callThrough();
            app.removePid('path');
        });
        
        it('should delete the pid file', function() {
            expect(fs.unlinkSync).toHaveBeenCalledWith('path');
        });
    });
    
    describe('parseCmdLine', function() {
        beforeEach(function() {
            app.parseCmdLine.and.callThrough();
        });
        
        it('should parse command line options', function() {
            process.argv = ['', '', '-c', 'mockConfig', '-i', '0'];
            var options = app.parseCmdLine();
            expect(options).toEqual({
                config: config,
                index: 0
            });
        });
        
        it('should throw an error for invalid config', function(done) {
            process.argv = ['', '', '-c', 'invalidConfig', '-i', '0'];
            try {
                app.parseCmdLine();
                done.fail();
            } catch(error) {
                expect(error).toBeDefined();
                done();
            }
        });
        
        it('should throw an error for invalid index', function(done) {
            process.argv = ['', '', '-c', 'mockConfig', '-i', 'invalid'];
            try {
                app.parseCmdLine();
                done.fail();
            } catch(error) {
                expect(error).toBeDefined();
                done();
            }
        });
        
        it('should update the config with service secrets', function() {
            process.argv = ['', '', '-c', 'mockConfig', '-i', '0'];
            var options = app.parseCmdLine();
            expect(options.config.secrets).toBe('so secret');
        });
    });
    
    describe('run', function() {
        beforeEach(function() {
            app.parseCmdLine.and.returnValue({
                config: config,
                index: 0
            });
        });
        
        it('should parse command line arguments', function() {
            app.run();
            expect(app.parseCmdLine).toHaveBeenCalled();
        });
        
        it('should create the log', function() {
            app.run();
            expect(logger.createLog).toHaveBeenCalledWith({ });
        });
        
        it('should create a new event processor', function() {
            app.run();
            expect(mockEventProcessor).toHaveBeenCalledWith(config);
        });
        
        it('should create a new record processor', function() {
            app.run();
            expect(mockRecordProcessor).toHaveBeenCalledWith(jasmine.any(mockEventProcessor));
        });
        
        it('should write a pid file', function() {
            app.run();
            expect(app.writePid).toHaveBeenCalledWith('/valid-dir/appName.pid');
        });
        
        it('should run the kcl app', function() {
            app.run();
            expect(mockKcl).toHaveBeenCalledWith(jasmine.any(mockRecordProcessor));
            expect(runSpy).toHaveBeenCalledWith();
        });
        
        it('should log an error if the app fails to start', function() {
            runSpy.and.callFake(function() {
                throw new Error('epic fail');
            });
            app.run();
            expect(mockLog.error).toHaveBeenCalled();
            expect(process.exit).toHaveBeenCalledWith(1);
        });
        
        it('should remove the pid file on exit', function() {
            app.run();
            expect(process.on).toHaveBeenCalledWith('exit', jasmine.any(Function));
            var handler = process.on.calls.all().filter(function(call) {
                return call.args[0] === 'exit';
            })[0].args[1];
            handler();
            expect(app.removePid).toHaveBeenCalledWith('/valid-dir/appName.pid');
        });
        
        it('should add a SIGHUP listener', function() {
            app.run();
            expect(process.on).toHaveBeenCalledWith('SIGHUP', jasmine.any(Function));
        });
    });
});
