'use strict';

var AWS = require('aws-sdk');
var JsonProducer = require('../../src/producers/JsonProducer.js');

describe('JsonProducer.js', function() {
    var jsonProducer;
    var mockKinesis;
    
    beforeEach(function() {
        mockKinesis = {
            putRecord: jasmine.createSpy('putRecord()')
        };
        spyOn(AWS, 'Kinesis').and.returnValue(mockKinesis);
    });
    
    describe('the constructor', function() {
        it('should set the Kinesis api when given options', function() {
            jsonProducer = new JsonProducer('superStream', 'options');
            expect(AWS.Kinesis).toHaveBeenCalledWith('options');
            expect(jsonProducer.kinesis).toEqual(mockKinesis);
        });
        
        it('should set the Kinesis api when not given any options', function() {
            jsonProducer = new JsonProducer('superStream');
            expect(AWS.Kinesis).toHaveBeenCalledWith({ });
            expect(jsonProducer.kinesis).toEqual(mockKinesis);
        });
        
        it('should set the stream name', function() {
            expect(jsonProducer.streamName).toBe('superStream');
        });
    });
    
    describe('the produce method', function() {
        beforeEach(function() {
            jsonProducer = new JsonProducer('superStream');
        });
        
        it('should return a promise', function() {
            var result = jsonProducer.produce({ });
            expect(result.then).toEqual(jasmine.any(Function));
        });
        
        it('should produce a record given an object and partition key', function() {
            jsonProducer.produce({
                type: 'fish',
                name: 'Wanda'
            }, 'key');
            expect(mockKinesis.putRecord).toHaveBeenCalledWith({
                Data: '{"type":"fish","name":"Wanda"}',
                PartitionKey: 'key',
                StreamName: 'superStream'
            }, jasmine.any(Function));
        });
        
        it('should produce a record given only an object', function() {
            jasmine.clock().install();
            jasmine.clock().mockDate(new Date(Date.UTC(2013, 9, 23)));
            jsonProducer.produce({
                type: 'fish',
                name: 'Magikarp'
            });
            expect(mockKinesis.putRecord).toHaveBeenCalledWith({
                Data: '{"type":"fish","name":"Magikarp"}',
                PartitionKey: '1382486400000',
                StreamName: 'superStream'
            }, jasmine.any(Function));
            jasmine.clock().uninstall();
        });
        
        it('should resolve with data if producing the record succeeds', function(done) {
            mockKinesis.putRecord.and.callFake(function(config, callback) {
                callback(null, 'data');
            });
            jsonProducer.produce({ }).then(function(data) {
                expect(data).toBe('data');
                done();
            }).catch(done.fail);
        });
        
        it('should reject if producing the record fails', function(done) {
            mockKinesis.putRecord.and.callFake(function(config, callback) {
                callback('error', null);
            });
            jsonProducer.produce({ }).then(done.fail).catch(function(error) {
                expect(error).toBe('error');
                done();
            });
        });
    });
});
