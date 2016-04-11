'use strict';

describe('MockObjectStream()', function() {
    var MockObjectStream = require('../helpers/MockObjectStream');
    var ReadableStream = require('readable-stream').Readable;
    var EventEmitter =  require('events').EventEmitter;
    var uuid = require('rc-uuid');

    it('should exist', function() {
        expect(MockObjectStream).toEqual(jasmine.any(Function));
        expect(MockObjectStream.name).toBe('MockObjectStream');
    });

    describe('instance:', function() {
        var stream;

        beforeEach(function() {
            stream = new MockObjectStream();
        });

        it('should be a ReadableStream', function() {
            expect(stream).toEqual(jasmine.any(ReadableStream));
            expect(stream._readableState.objectMode).toBe(true, 'stream is not in object mode');
        });

        describe('properties:', function() {
            describe('source', function() {
                it('should be an EventEmitter', function() {
                    expect(stream.source).toEqual(jasmine.any(EventEmitter));
                });

                describe('properties:', function() {
                    describe('error', function() {
                        it('should be null', function() {
                            expect(stream.source.error).toBeNull();
                        });
                    });

                    describe('items', function() {
                        it('should be an Array', function() {
                            expect(stream.source.items).toEqual([]);
                        });
                    });

                    describe('isDone', function() {
                        it('should be false', function() {
                            expect(stream.source.isDone).toBe(false);
                        });
                    });
                });

                describe('methods:', function() {
                    describe('add(items, done)', function() {
                        var items, done;
                        var add;

                        beforeEach(function() {
                            add = jasmine.createSpy('add()');
                            stream.source.on('add', add);

                            spyOn(stream.source, 'done').and.callThrough();

                            items = Array.apply([], new Array(10)).map(function() { return { id: uuid.createUuid() }; });
                            done = false;

                            stream.source.add(items, done);
                        });

                        it('should add the items', function() {
                            expect(stream.source.items).toEqual(jasmine.arrayContaining(items));
                        });

                        it('should emit "add"', function() {
                            expect(add).toHaveBeenCalledWith(items);
                        });

                        it('should not call done()', function() {
                            expect(stream.source.done).not.toHaveBeenCalled();
                        });

                        describe('if called with an empty array', function() {
                            beforeEach(function() {
                                items = [];
                                add.calls.reset();

                                stream.source.add(items);
                            });

                            it('should not overwrite the items', function() {
                                expect(stream.source.items).not.toEqual([]);
                            });

                            it('should not emit "add"', function() {
                                expect(add).not.toHaveBeenCalled();
                            });
                        });

                        describe('if done is true', function() {
                            beforeEach(function() {
                                done = true;
                                stream.source.done.calls.reset();

                                stream.source.add(items, done);
                            });

                            it('should call done()', function() {
                                expect(stream.source.done).toHaveBeenCalledWith();
                            });
                        });
                    });

                    describe('pull()', function() {
                        var items;
                        var done;
                        var result;

                        beforeEach(function() {
                            done = jasmine.createSpy('done()');
                            stream.source.on('done', done);

                            items = Array.apply([], new Array(10)).map(function() { return { id: uuid.createUuid() }; });
                            stream.source.add(items);

                            result = stream.source.pull();
                        });

                        it('should return the first item', function() {
                            expect(result).toBe(items[0]);
                        });

                        it('should remove the first item', function() {
                            expect(stream.source.items).toEqual(items.slice(1));
                        });

                        it('should not emit done()', function() {
                            expect(done).not.toHaveBeenCalled();
                        });

                        describe('when the last item is removed', function() {
                            beforeEach(function() {
                                stream.source.items = [{ id: uuid.createUuid() }];
                            });

                            describe('if isDone is false', function() {
                                beforeEach(function() {
                                    stream.source.isDone = false;

                                    stream.source.pull();
                                });

                                it('should not emit done()', function() {
                                    expect(done).not.toHaveBeenCalled();
                                });
                            });

                            describe('if isDone is true', function() {
                                beforeEach(function() {
                                    stream.source.isDone = true;

                                    stream.source.pull();
                                });

                                it('should emit done()', function() {
                                    expect(done).toHaveBeenCalled();
                                });
                            });
                        });

                        describe('if there are no more items', function() {
                            beforeEach(function() {
                                stream.source.items = [];
                            });

                            it('should return null', function() {
                                expect(stream.source.pull()).toBeNull();
                            });

                            it('should not emit done()', function() {
                                expect(done).not.toHaveBeenCalled();
                            });
                        });
                    });

                    describe('done()', function() {
                        var done;

                        beforeEach(function() {
                            done = jasmine.createSpy('done()');
                            stream.source.on('done', done);
                        });

                        describe('if there are still items to be pulled', function() {
                            beforeEach(function() {
                                stream.source.items = [{ id: uuid.createUuid() }];

                                stream.source.done();
                            });

                            it('should set isDone to true', function() {
                                expect(stream.source.isDone).toBe(true);
                            });

                            it('should not emit done()', function() {
                                expect(done).not.toHaveBeenCalled();
                            });
                        });

                        describe('if there are no more items to be pulled', function() {
                            beforeEach(function() {
                                stream.source.items = [];

                                stream.source.done();
                            });

                            it('should set isDone to true', function() {
                                expect(stream.source.isDone).toBe(true);
                            });

                            it('should emit done()', function() {
                                expect(done).toHaveBeenCalled();
                            });
                        });
                    });

                    describe('fail()', function() {
                        var error;

                        beforeEach(function() {
                            error = new Error('OH NO!');

                            stream.source.fail(error);
                        });

                        it('should set the error property', function() {
                            expect(stream.source.error).toBe(error);
                        });

                        describe('when pull() is called', function() {
                            it('should throw the error', function() {
                                expect(function() { stream.source.pull(); }).toThrow(error);
                            });
                        });
                    });
                });
            });
        });

        describe('methods:', function() {
            describe('_read(size)', function() {
                var size;
                var error;

                beforeEach(function() {
                    size = 16;

                    error = jasmine.createSpy('error()');
                    stream.on('error', error);

                    spyOn(stream, 'push').and.callThrough();
                });

                describe('if the stream is set to fail', function() {
                    var reason;

                    beforeEach(function() {
                        reason = new Error('Oh no!');
                        stream.source.fail(reason);

                        stream._read(size);
                    });

                    it('should emit an error', function() {
                        expect(error).toHaveBeenCalledWith(reason);
                    });
                });

                describe('if there is an item available', function() {
                    var item;

                    beforeEach(function() {
                        item = { id: uuid.createUuid() };
                        stream.source.add([item]);
                        stream.source.isDone = true;

                        stream._read(size);
                    });

                    it('should do nothing', function() {
                        expect(stream.push).not.toHaveBeenCalled();
                    });

                    describe('in the next turn of the event loop', function() {
                        beforeEach(function(done) {
                            process.nextTick(done);
                        });

                        it('should push() the item', function() {
                            expect(stream.push).toHaveBeenCalledWith(item);
                        });

                        it('should not push() null', function() {
                            expect(stream.push).not.toHaveBeenCalledWith(null);
                        });
                    });
                });

                describe('if there is no item available', function() {
                    beforeEach(function() {
                        stream.source.isDone = false;

                        stream._read(size);
                    });

                    it('should do nothing', function() {
                        expect(stream.push).not.toHaveBeenCalled();
                    });

                    describe('in the next turn of the event loop', function() {
                        beforeEach(function(done) {
                            process.nextTick(done);
                        });

                        it('should do nothing', function() {
                            expect(stream.push).not.toHaveBeenCalled();
                        });

                        describe('if the source is done', function() {
                            beforeEach(function(done) {
                                stream.push.calls.reset();
                                stream.source.isDone = true;

                                stream._read(size);
                                process.nextTick(done);
                            });

                            it('should push() null', function() {
                                expect(stream.push).toHaveBeenCalledWith(null);
                            });
                        });
                    });

                    describe('when items are added', function() {
                        var item;

                        beforeEach(function() {
                            item = { id: uuid.createUuid() };
                            stream.source.add([item]);
                        });

                        it('should push() the item', function() {
                            expect(stream.push).toHaveBeenCalledWith(item);
                        });
                    });
                });
            });
        });
    });
});
