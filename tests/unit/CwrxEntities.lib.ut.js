describe('CwrxEntities(endpoint, appCreds)', function() {
    'use strict';

    var CwrxEntities = require('../../lib/CwrxEntities');
    var DuplexStream = require('readable-stream').Duplex;
    var CwrxRequest = require('../../lib/CwrxRequest');
    var uuid = require('rc-uuid');
    var q = require('q');
    var ld = require('lodash');

    it('should exist', function() {
        expect(CwrxEntities).toEqual(jasmine.any(Function));
        expect(CwrxEntities.name).toBe('CwrxEntities');
    });

    describe('instance:', function() {
        var endpoint, appCreds;
        var entities;

        beforeEach(function() {
            endpoint = 'http://33.33.33.10/api/account/orgs';
            appCreds = {
                key: 'watchman-app',
                secret: 'dwieydh8349hrd8374hr483uery8fh347'
            };

            entities = new CwrxEntities(endpoint, appCreds, { foo: 'bar' });
        });

        it('should be a ReadableStream in object mode', function() {
            expect(entities).toEqual(jasmine.any(DuplexStream));
            expect(entities._readableState.objectMode).toBe(true);
            expect(entities._writableState.objectMode).toBe(true);
            expect(entities._readableState.highWaterMark).toBe(50);
        });

        it('should create a CwrxRequest()', function() {
            expect(entities.__private__.request).toEqual(jasmine.any(CwrxRequest));
            expect(entities.__private__.request.creds).toEqual(appCreds);
            expect(entities.__private__.query).toEqual({ foo: 'bar' });
        });

        describe('methods:', function() {
            describe('_read(size)', function() {
                var size;
                var getDeferred;

                beforeEach(function(done) {
                    size = 50;

                    spyOn(entities, 'push').and.returnValue(true);
                    spyOn(entities.__private__.request, 'get').and.returnValue((getDeferred = q.defer()).promise);

                    entities._read(size);
                    process.nextTick(done);
                });

                it('should make a request to cwrx', function() {
                    expect(entities.__private__.request.get).toHaveBeenCalledWith({
                        url: endpoint,
                        qs: {
                            limit: size,
                            skip: 0,
                            sort: 'created,1',
                            foo: 'bar'
                        }
                    });
                });

                describe('if the request succeeds', function() {
                    var response, body;

                    beforeEach(function(done) {
                        response = {
                            headers: {
                                'content-range': '1-50/324'
                            }
                        };
                        body = Array.apply([], new Array(size)).map(function() {
                            return {
                                id: 'o-' + uuid.createUuid()
                            };
                        });

                        getDeferred.fulfill([body, response]);
                        process.nextTick(done);
                    });

                    it('should push the objects into the stream', function() {
                        expect(body.length).toBeGreaterThan(0, 'No data in the response.');
                        expect(entities.push).toHaveBeenCalledWith(body);
                    });

                    describe('when _read() is called again', function() {
                        beforeEach(function(done) {
                            entities.__private__.request.get.and.returnValue((getDeferred = q.defer()).promise);

                            entities._read(size);
                            process.nextTick(done);
                        });

                        it('should make another request', function() {
                            expect(entities.__private__.request.get).toHaveBeenCalledWith({
                                url: endpoint,
                                qs: {
                                    limit: size,
                                    skip: 50,
                                    sort: 'created,1',
                                    foo: 'bar'
                                }
                            });
                        });
                    });
                });

                describe('when all the entities have been fetched', function() {
                    var total;

                    function getResponse(limit, skip, total) {
                        var start = skip + 1;
                        var end = Math.min(skip + limit, total);
                        var length = end - start + 1;

                        var response = {
                            headers: {
                                'content-range': start + '-' + end + '/' + total
                            }
                        };
                        var body = Array.apply([], new Array(length)).map(function() {
                            return {
                                id: 'o-' +  uuid.createUuid()
                            };
                        });

                        return q([body, response]);
                    }

                    beforeEach(function(done) {
                        var read = 50;

                        total = 324;

                        entities.push.and.callFake(function(data) {
                            if (data !== null) {
                                entities._read(size);
                                read += size;
                            }

                            if (read >= total) {
                                process.nextTick(done);
                            }
                        });

                        entities.__private__.request.get.and.callFake(function(config) {
                            return getResponse(config.qs.limit, config.qs.skip, total);
                        });

                        getDeferred.resolve(getResponse(size, 50, total));
                    });

                    it('should call push() with null', function() {
                        expect(entities.push.calls.count()).toBe(Math.ceil(total / size) + 1, 'push() not called the correct number of times.');
                        expect(entities.push).toHaveBeenCalledWith(null);
                    });
                });

                describe('if the request fails', function() {
                    var reason;
                    var error;

                    beforeEach(function(done) {
                        reason = new Error('500 - I SUCK.');
                        reason.name = 'StatusCodeError';
                        reason.statusCode = 'I SUCK.';

                        error = jasmine.createSpy('error');
                        entities.on('error', error);

                        getDeferred.reject(reason);
                        process.nextTick(done);
                    });

                    it('should emit an error', function() {
                        expect(error).toHaveBeenCalledWith(reason);
                    });
                });
            });

            describe('_write(chunk, encoding, callback)', function() {
                var chunk, encoding, callback;
                var postDeferred;

                beforeEach(function(done) {
                    chunk = {
                        qs: { foo: 'bar' },
                        body: { id: uuid.createUuid() }
                    };
                    encoding = null;
                    callback = jasmine.createSpy('callback()');

                    spyOn(entities.__private__.request, 'post').and.returnValue((postDeferred = q.defer()).promise);

                    entities._write(chunk, encoding, callback);
                    process.nextTick(done);
                });

                it('should POST to the endpoint', function() {
                    expect(entities.__private__.request.post).toHaveBeenCalledWith(ld.assign({}, chunk, { url: endpoint }));
                });

                it('should not call the callback', function() {
                    expect(callback).not.toHaveBeenCalled();
                });

                describe('if the request fails', function() {
                    var reason;

                    beforeEach(function(done) {
                        reason = new Error('There was a problem!');
                        postDeferred.reject(reason);

                        process.nextTick(done);
                    });

                    it('should call the callback with the reason', function() {
                        expect(callback).toHaveBeenCalledWith(reason);
                    });
                });

                describe('if the request succeeds', function() {
                    var response;

                    beforeEach(function(done) {
                        response = { id: uuid.createUuid() };

                        postDeferred.fulfill(response);
                        process.nextTick(done);
                    });

                    it('should call the callback with nothing', function() {
                        expect(callback).toHaveBeenCalledWith();
                    });
                });
            });
        });
    });
});
