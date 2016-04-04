'use strict';

describe('MockObjectStore()', function() {
    var MockObjectStore = require('../helpers/MockObjectStore');
    var WritableStream = require('readable-stream').Writable;
    var uuid = require('rc-uuid');

    it('should exist', function() {
        expect(MockObjectStore).toEqual(jasmine.any(Function));
        expect(MockObjectStore.name).toBe('MockObjectStore');
    });

    describe('instance:', function() {
        var stream;

        beforeEach(function() {
            stream = new MockObjectStore();
        });

        it('should be a WritableStream', function() {
            expect(stream).toEqual(jasmine.any(WritableStream));
            expect(stream._writableState.objectMode).toBe(true, 'stream is not in object mode');
        });

        describe('properties:', function() {
            describe('items', function() {
                it('should be an Array', function() {
                    expect(stream.items).toEqual([]);
                });
            });

            describe('error', function() {
                it('should be null', function() {
                    expect(stream.error).toBeNull();
                });
            });
        });

        describe('methods:', function() {
            describe('fail(reason)', function() {
                var reason;

                beforeEach(function() {
                    reason = new Error('Yikes!');

                    stream.fail(reason);
                });

                it('should set the error property', function() {
                    expect(stream.error).toBe(reason);
                });
            });

            describe('_write(chunk, encoding, callback)', function() {
                var chunk, encoding, callback;

                beforeEach(function() {
                    chunk = { id: uuid.createUuid() };
                    encoding = null;
                    callback = jasmine.createSpy('callback()');

                    stream._write(chunk, encoding, callback);
                });

                it('should do nothing', function() {
                    expect(stream.items).toEqual([]);
                    expect(callback).not.toHaveBeenCalled();
                });

                describe('in the next turn of the event loop', function() {
                    beforeEach(function(done) {
                        process.nextTick(done);
                    });

                    it('should add the item to the items array', function() {
                        expect(stream.items).toEqual(jasmine.arrayContaining([chunk]));
                    });

                    it('should call the callback', function() {
                        expect(callback).toHaveBeenCalledWith(null);
                    });
                });

                describe('if there is an error', function() {
                    var reason;

                    beforeEach(function() {
                        reason = new Error('I suck!');
                        stream.fail(reason);

                        stream._write(chunk, encoding, callback);
                    });

                    it('should do nothing', function() {
                        expect(stream.items).toEqual([]);
                        expect(callback).not.toHaveBeenCalled();
                    });

                    describe('in the next turn of the event loop', function() {
                        beforeEach(function(done) {
                            process.nextTick(done);
                        });

                        it('should emit an error', function() {
                            expect(callback).toHaveBeenCalledWith(reason);
                        });
                    });
                });
            });
        });
    });
});
