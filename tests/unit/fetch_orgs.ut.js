'use strict';

describe('(action) fetch_orgs', function() {
    var fetchOrgsFactory, fetchOrgs;
    var CwrxEntities, JsonProducer;
    var resolveURL, uuid, MockObjectStream, MockObjectStore;
    var config;

    beforeEach(function() {
        Object.keys(require.cache).forEach(function(dep) {
            delete require.cache[dep];
        });

        MockObjectStream = require('../helpers/MockObjectStream');
        MockObjectStore = require('../helpers/MockObjectStore');

        require('../../lib/CwrxEntities');
        require('rc-kinesis');

        CwrxEntities = jasmine.createSpy('CwrxEntities()').and.callFake(function() {
            return new MockObjectStream();
        });
        require.cache[require.resolve('../../lib/CwrxEntities')].exports = CwrxEntities;

        JsonProducer = (function(JsonProducer) {
            return jasmine.createSpy('JsonProducer()').and.callFake(function(name, options) {
                var producer = new JsonProducer(name, options);

                spyOn(producer, 'createWriteStream').and.callFake(function() {
                    return new MockObjectStore();
                });

                return producer;
            });
        }(require('rc-kinesis').JsonProducer));
        require.cache[require.resolve('rc-kinesis')].exports.JsonProducer = JsonProducer;

        resolveURL = require('url').resolve;

        uuid = require('rc-uuid');

        fetchOrgsFactory = require('../../src/actions/fetch_orgs');

        config = {
            appCreds: {
                key: 'watchman-dev',
                secret: 'dwei9fhj3489ghr7834909r'
            },
            cwrx: {
                api: {
                    root: 'http://33.33.33.10/',
                    orgs: {
                        endpoint: '/api/account/orgs'
                    }
                }
            },
            kinesis: {
                producer: {
                    region: 'us-east-1',
                    stream: 'devWatchmanStream'
                }
            }
        };

        fetchOrgs = fetchOrgsFactory(config);
    });

    it('should exist', function() {
        expect(fetchOrgs).toEqual(jasmine.any(Function));
        expect(fetchOrgs.name).toBe('fetchOrgs');
    });

    describe('when called', function() {
        var data, options, event;
        var success, failure;

        var orgs, watchmanProducer, watchmanStream;

        beforeEach(function(done) {
            data = {
                date: new Date().toISOString()
            };
            options = {
                prefix: 'daily'
            };

            event = { options: options, data: data };

            success = jasmine.createSpy('success()');
            failure = jasmine.createSpy('failure()');

            fetchOrgs(event).then(success, failure);

            orgs = CwrxEntities.calls.mostRecent().returnValue;
            watchmanProducer = JsonProducer.calls.mostRecent().returnValue;
            watchmanStream = watchmanProducer.createWriteStream.calls.mostRecent().returnValue;

            process.nextTick(done);
        });

        it('should create a CwrxEntities stream', function() {
            expect(CwrxEntities).toHaveBeenCalledWith(resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint), config.appCreds);
        });

        it('should create a JsonProducer write stream', function() {
            expect(JsonProducer).toHaveBeenCalledWith(config.kinesis.producer.stream, config.kinesis.producer);
            expect(watchmanProducer.createWriteStream).toHaveBeenCalledWith();
        });

        describe('if the orgs are fetched', function() {
            var items;

            beforeEach(function() {
                items = Array.apply([], new Array(10)).map(function() { return { id: uuid.createUuid() }; });

                orgs.source.add(items, true);
            });

            describe('and there is no problem writing them', function() {
                beforeEach(function(done) {
                    watchmanStream.once('finish', function() { process.nextTick(done); });
                });

                it('should fulfill the Promise', function() {
                    expect(success).toHaveBeenCalledWith(undefined);
                });

                it('should transform the orgs into kenisis data', function() {
                    expect(watchmanStream.items).toEqual(items.map(function(org) {
                        return {
                            type: options.prefix + '_orgPulse',
                            data: {
                                org: org,
                                date: data.date
                            }
                        };
                    }));
                });
            });

            describe('and there is a problem writing to the Kinesis stream', function() {
                var error;

                beforeEach(function(done) {
                    error = new Error('It went wrong!');
                    watchmanStream.fail(error);

                    setTimeout(done, 0);
                });

                it('should reject the Promise', function() {
                    expect(failure).toHaveBeenCalledWith(error);
                });
            });
        });

        describe('if there is a problem getting the orgs', function() {
            var error;

            beforeEach(function(done) {
                error = new Error('It went wrong!');
                orgs.source.fail(error);
                orgs.source.add([{}], true);

                setTimeout(done, 0);
            });

            it('should reject the Promise', function() {
                expect(failure).toHaveBeenCalledWith(error);
            });
        });

        describe('if there is no prefix', function() {
            var data;

            beforeEach(function(done) {
                delete options.prefix;

                fetchOrgs(event).then(success, failure);

                orgs = CwrxEntities.calls.mostRecent().returnValue;
                watchmanProducer = JsonProducer.calls.mostRecent().returnValue;
                watchmanStream = watchmanProducer.createWriteStream.calls.mostRecent().returnValue;

                data = Array.apply([], new Array(10)).map(function() { return { id: uuid.createUuid() }; });
                orgs.source.add(data, true);

                watchmanStream.once('finish', function() { process.nextTick(done); });
            });

            it('should not prefix the record type', function() {
                expect(watchmanStream.items).toEqual(data.map(function() {
                    return jasmine.objectContaining({
                        type: 'orgPulse'
                    });
                }));
            });
        });
    });
});
