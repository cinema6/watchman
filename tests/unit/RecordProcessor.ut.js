'use strict';

var RecordProcessor = require('../../src/record_processors/RecordProcessor.js');
var Q = require('q');
var fs =  require('fs');
var logger = require('cwrx/lib/logger.js');

describe('RecordProcessor.js', function() {
    var recordProcessor;
    var callback;
    var mockProcessor;
    var mockLog;
    var mockCheckpointer;

    beforeEach(function() {
        callback = jasmine.createSpy('callback()');
        mockProcessor = {
            name: 'name',
            process: jasmine.createSpy('process()')
        };
        mockLog = {
            trace: jasmine.createSpy('trace()'),
            info: jasmine.createSpy('info()'),
            warn: jasmine.createSpy('warn()'),
            error: jasmine.createSpy('error()')
        };
        mockCheckpointer = {
            checkpoint: jasmine.createSpy('checkpoint()')
        };
        recordProcessor = new RecordProcessor(mockProcessor, '/pid/path', 'appName');
        spyOn(fs, 'accessSync');
        spyOn(fs, 'unlinkSync');
        spyOn(fs, 'writeFileSync');
        spyOn(fs, 'readFileSync');
        spyOn(recordProcessor, 'checkpoint').and.callThrough();
        spyOn(logger, 'getLog').and.returnValue(mockLog);
        spyOn(process, 'exit');
        spyOn(process, 'kill');
        spyOn(process, 'on');
    });

    describe('the constructor', function() {
        it('initialize its properties', function() {
            expect(recordProcessor.appName).toBe('appName');
            expect(recordProcessor.name).toBe('name record processor');
            expect(recordProcessor.pidPath).toBe('/pid/path');
            expect(recordProcessor.processor).toEqual(mockProcessor);
            expect(recordProcessor.shardId).toBeNull();
        });

        it('should throw an error if not given an event processor', function() {
            var error = null;
            try {
                new RecordProcessor();
            } catch(err) {
                error = err;
            }
            expect(error).not.toBeNull();
        });
    });

    describe('the initialize method', function() {
        var initialize;

        beforeAll(function() {
            initialize = function() {
                recordProcessor.initialize({
                    shardId: 'shard-000'
                }, callback);
            };
        });

        afterEach(function() {
            expect(callback).toHaveBeenCalledWith();
        });

        it('should set the shardId', function() {
            initialize();
            expect(recordProcessor.shardId).toBe('shard-000');
        });

        describe('pid handling', function() {
            it('should kill the process of an existing pid', function() {
                fs.accessSync.and.returnValue({});
                fs.readFileSync.and.returnValue(123);
                initialize();
                expect(process.kill).toHaveBeenCalledWith(123);
            });

            it('should write a pid', function() {
                initialize();
                expect(fs.writeFileSync).toHaveBeenCalledWith('/pid/path/appName-shard-000.pid',
                    jasmine.any(String));
            });

            it('should remove the pid on exit', function() {
                initialize();
                expect(process.on).toHaveBeenCalledWith('exit', jasmine.any(Function));
                var handler = process.on.calls.mostRecent().args[1];
                handler();
                expect(fs.unlinkSync).toHaveBeenCalledWith('/pid/path/appName-shard-000.pid');
            });
        });
    });

    describe('the processRecords method', function() {
        it('should not attempt to process non-existant records', function() {
            recordProcessor.processRecords(null, callback);
            expect(mockProcessor.process).not.toHaveBeenCalled();
            expect(callback).toHaveBeenCalled();
            callback.calls.reset();

            recordProcessor.processRecords({ records: null }, callback);
            expect(mockProcessor.process).not.toHaveBeenCalled();
            expect(callback).toHaveBeenCalled();
            callback.calls.reset();

            recordProcessor.processRecords({ records: [] }, callback);
            expect(mockProcessor.process).not.toHaveBeenCalled();
            expect(callback).toHaveBeenCalled();
            callback.calls.reset();
        });

        describe('when receiving a batch of valid records', function() {
            beforeEach(function(done) {
                var records = [
                    { data: 'eyJmaXNoIjoidHJvdXQiLCJtZXNzYWdlIjoiaSA8MyBzdHJlYW1zIn0=',
                        sequenceNumber: '1' },
                    { data: 'eyJmaXNoIjoiY2xvd24iLCJtZXNzYWdlIjoiYmx1YiJ9', sequenceNumber: '2' },
                    { data:
                        'eyJ3YXRlciI6NTAsIm1lc3NhZ2UiOiJzbyBtdWNoIHdhdGVyIGluIHRoaXMgc3RyZWFtIn0=',
                        sequenceNumber: '3' }
                ];
                recordProcessor.processRecords({ records: records, checkpointer: 'checkpointer' },
                    callback);
                recordProcessor.checkpoint.and.returnValue(Q.resolve());
                mockProcessor.process.and.returnValue(Q.resolve());
                process.nextTick(done);
            });

            it('should process them as json', function() {
                var expectedJson = [
                    { fish: 'trout', message: 'i <3 streams' },
                    { fish: 'clown', message: 'blub'},
                    { water: 50, message: 'so much water in this stream'}
                ];
                expectedJson.forEach(function(expected) {
                    expect(mockProcessor.process).toHaveBeenCalledWith(expected);
                });
                expect(callback).toHaveBeenCalled();
            });

            it('should perform a checkpoint', function() {
                expect(recordProcessor.checkpoint).toHaveBeenCalledWith('checkpointer', '3');
                expect(callback).toHaveBeenCalled();
            });
        });

        describe('when receiving a batch containing some invalid records', function() {
            beforeEach(function(done) {
                var records = [
                    { data: 'eyJmaXNoIjoidHJvdXQiLCJtZXNzYWdlIjoiaSA8MyBzdHJlYW1zIn0=',
                        sequenceNumber: '1' },
                    { data: 'ImFsbW9zdCI6Impzb24i', sequenceNumber: '2' },
                    { data: 'clearly_invalid', sequenceNumber: '3' }
                ];
                recordProcessor.processRecords({ records: records, checkpointer: 'checkpointer' },
                    callback);
                recordProcessor.checkpoint.and.returnValue(Q.resolve());
                mockProcessor.process.and.returnValue(Q.resolve());
                process.nextTick(done);
            });

            it('should process only the valid json', function() {
                var expected = { fish: 'trout', message: 'i <3 streams' };
                expect(mockProcessor.process).toHaveBeenCalledWith(expected);
                expect(mockProcessor.process.calls.count()).toBe(1);
                expect(callback).toHaveBeenCalled();
            });

            it('should still checkpoint after the batch', function() {
                expect(recordProcessor.checkpoint).toHaveBeenCalledWith('checkpointer', '3');
                expect(callback).toHaveBeenCalled();
            });

            it('should log a warning for each invalid record', function() {
                expect(mockLog.warn.calls.count()).toBe(2);
                expect(callback).toHaveBeenCalled();
            });
        });

        it('should log a warning if checkpointing fails', function(done) {
            var records = [
                { data: 'eyJmaXNoIjoidHJvdXQiLCJtZXNzYWdlIjoiaSA8MyBzdHJlYW1zIn0=',
                    sequenceNumber: '1' },
                { data: 'eyJmaXNoIjoiY2xvd24iLCJtZXNzYWdlIjoiYmx1YiJ9', sequenceNumber: '2' },
                { data: 'eyJ3YXRlciI6NTAsIm1lc3NhZ2UiOiJzbyBtdWNoIHdhdGVyIGluIHRoaXMgc3RyZWFtIn0=',
                    sequenceNumber: '3' }
            ];
            recordProcessor.processRecords({ records: records, checkpointer: 'checkpointer' },
                callback);
            recordProcessor.checkpoint.and.returnValue(Q.reject());
            mockProcessor.process.and.returnValue(Q.resolve());
            process.nextTick(function() {
                expect(recordProcessor.checkpoint).toHaveBeenCalledWith('checkpointer', '3');
                expect(mockLog.warn).toHaveBeenCalled();
                done();
            });
        });

        it('should log an error on unexpected failure', function(done) {
            var records = [
                { data: 'eyJmaXNoIjoidHJvdXQiLCJtZXNzYWdlIjoiaSA8MyBzdHJlYW1zIn0=',
                    sequenceNumber: '1' },
                { data: 'eyJmaXNoIjoiY2xvd24iLCJtZXNzYWdlIjoiYmx1YiJ9', sequenceNumber: '2' },
                { data: 'eyJ3YXRlciI6NTAsIm1lc3NhZ2UiOiJzbyBtdWNoIHdhdGVyIGluIHRoaXMgc3RyZWFtIn0=',
                    sequenceNumber: '3' }
            ];
            recordProcessor.processRecords({ records: records, checkpointer: 'checkpointer' },
                callback);
            recordProcessor.checkpoint.and.returnValue(Q.resolve());
            mockProcessor.process.and.returnValue(Q.resolve());
            mockLog.info.and.callFake(function() {
                throw new Error('epic fail');
            });
            process.nextTick(function() {
                expect(mockLog.error).toHaveBeenCalled();
                done();
            });
        });
    });

    describe('the shutdown method', function() {
        describe('when the reason is TERMINATE', function() {
            it('should perform a checkpoint and exit the process', function(done) {
                recordProcessor.checkpoint.and.returnValue(Q.resolve());
                recordProcessor.shutdown({ reason: 'TERMINATE', checkpointer: 'checkpointer' },
                    callback);
                process.nextTick(function() {
                    expect(recordProcessor.checkpoint).toHaveBeenCalledWith('checkpointer');
                    expect(callback).toHaveBeenCalled();
                    expect(process.exit).toHaveBeenCalledWith(0);
                    done();
                });
            });

            it('should log a warning if the checkpoint fails', function(done) {
                recordProcessor.checkpoint.and.returnValue(Q.reject());
                recordProcessor.shutdown({ reason: 'TERMINATE', checkpointer: 'checkpointer' },
                    callback);
                process.nextTick(function() {
                    expect(recordProcessor.checkpoint).toHaveBeenCalledWith('checkpointer');
                    expect(mockLog.warn).toHaveBeenCalled();
                    expect(callback).toHaveBeenCalled();
                    done();
                });
            });
        });

        describe('when the reason is ZOMBIE', function() {
            it('should not perform a checkpoint and exit the process', function(done) {
                recordProcessor.shutdown({ reason: 'ZOMBIE', checkpointer: 'checkpointer' },
                    callback);
                process.nextTick(function() {
                    expect(recordProcessor.checkpoint).not.toHaveBeenCalled();
                    expect(callback).toHaveBeenCalled();
                    expect(process.exit).toHaveBeenCalledWith(0);
                    done();
                });
            });
        });

        it('should log an error on unexpected failure and exit the process', function(done) {
            recordProcessor.checkpoint.and.returnValue(Q.reject());
            recordProcessor.shutdown({ reason: 'TERMINATE', checkpointer: 'checkpointer' },
                callback);
            mockLog.warn.and.callFake(function() {
                throw new Error('epic fail');
            });
            process.nextTick(function() {
                expect(mockLog.error).toHaveBeenCalled();
                expect(callback).toHaveBeenCalled();
                expect(process.exit).toHaveBeenCalledWith(0);
                done();
            });
        });
    });

    describe('the checkpoint method', function() {
        it('should resolve with the checkpoint sequence number', function(done) {
            mockCheckpointer.checkpoint.and.callFake(function(num, cb) {
                cb(null, 'checkpoint-num');
            });
            recordProcessor.checkpoint(mockCheckpointer, '123').then(function(sequenceNumber) {
                expect(mockCheckpointer.checkpoint).toHaveBeenCalledWith('123',
                    jasmine.any(Function));
                expect(sequenceNumber).toBe('checkpoint-num');
                done();
            }).catch(done.fail);
        });

        it('should reject if an error occurs', function(done) {
            mockCheckpointer.checkpoint.and.callFake(function(num, cb) {
                cb('epic fail', null);
            });
            recordProcessor.checkpoint(mockCheckpointer, '123').then(done.fail)
            .catch(function(error) {
                expect(error).toBe('epic fail');
                done();
            });
        });

        it('should work if not given a sequence number', function(done) {
            mockCheckpointer.checkpoint.and.callFake(function(num, cb) {
                cb(null, 'checkpoint-num');
            });
            recordProcessor.checkpoint(mockCheckpointer).then(function(sequenceNumber) {
                expect(mockCheckpointer.checkpoint).toHaveBeenCalledWith(null,
                    jasmine.any(Function));
                expect(sequenceNumber).toBe('checkpoint-num');
                done();
            }).catch(done.fail);
        });
    });
});
