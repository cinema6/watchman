'use strict';

describe('(action factory) charge_payment_plan', function() {
    var q, uuid, resolveURL;
    var JsonProducer, CwrxRequest;
    var factory;

    beforeEach(function() {
        Object.keys(require.cache).forEach(function(dep) {
            delete require.cache[dep];
        });

        q = require('q');
        uuid = require('rc-uuid');
        resolveURL = require('url').resolve;

        JsonProducer = (function(JsonProducer) {
            return jasmine.createSpy('JsonProducer()').and.callFake(function(name, options) {
                var producer = new JsonProducer(name, options);

                spyOn(producer, 'produce').and.returnValue(q.defer().promise);

                return producer;
            });
        }(require('rc-kinesis').JsonProducer));
        require.cache[require.resolve('rc-kinesis')].exports.JsonProducer = JsonProducer;

        CwrxRequest = (function(CwrxRequest) {
            return jasmine.createSpy('CwrxRequest()').and.callFake(function(creds) {
                var request = new CwrxRequest(creds);

                spyOn(request, 'send').and.returnValue(q.defer().promise);

                return request;
            });
        }(require('../../lib/CwrxRequest')));
        require.cache[require.resolve('../../lib/CwrxRequest')].exports = CwrxRequest;

        factory = require('../../src/actions/charge_payment_plan');
    });

    it('should exist', function() {
        expect(factory).toEqual(jasmine.any(Function));
        expect(factory.name).toBe('chargePaymentPlanFactory');
    });

    describe('when called', function() {
        var config;
        var chargePaymentPlan;
        var request, watchmanStream;

        beforeEach(function() {
            config = {
                appCreds: {
                    key: 'watchman-dev',
                    secret: 'dwei9fhj3489ghr7834909r'
                },
                cwrx: {
                    api: {
                        root: 'http://33.33.33.10/',
                        payments: {
                            endpoint: '/api/payments/'
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

            chargePaymentPlan = factory(config);

            request = CwrxRequest.calls.mostRecent().returnValue;
            watchmanStream = JsonProducer.calls.mostRecent().returnValue;
        });

        it('should return the action Function', function() {
            expect(chargePaymentPlan).toEqual(jasmine.any(Function));
            expect(chargePaymentPlan.name).toBe('chargePaymentPlan');
        });

        it('should create a JsonProducer for watchman', function() {
            expect(JsonProducer).toHaveBeenCalledWith(config.kinesis.producer.stream, config.kinesis.producer);
        });

        it('should create a CwrxRequest', function() {
            expect(CwrxRequest).toHaveBeenCalledWith(config.appCreds);
        });

        describe('the action', function() {
            var data, options, event;
            var postPaymentDeferred;
            var success, failure;

            beforeEach(function(done) {
                data = {
                    org: {
                        id: 'o-' + uuid.createUuid()
                    },
                    paymentPlan: {
                        id: 'pp-' + uuid.createUuid(),
                        price: 49.99
                    },
                    paymentMethod: {
                        token: uuid.createUuid(),
                        default: true
                    }
                };
                options = {
                    target: 'bob'
                };
                event = { data: data, options: options };

                success = jasmine.createSpy('success()');
                failure = jasmine.createSpy('failure()');

                spyOn(request, 'post').and.returnValue((postPaymentDeferred = q.defer()).promise);

                chargePaymentPlan(event).then(success, failure);
                process.nextTick(done);
            });

            it('should POST a payment for the price of the payment plan', function() {
                expect(request.post).toHaveBeenCalledWith({
                    url: resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint),
                    qs: {
                        org: data.org.id,
                        target: options.target
                    },
                    json: {
                        paymentMethod: data.paymentMethod.token,
                        amount: data.paymentPlan.price
                    }
                });
            });

            describe('if the request succeeds', function() {
                var produceDeferred;

                beforeEach(function(done) {
                    watchmanStream.produce.and.returnValue((produceDeferred = q.defer()).promise);

                    postPaymentDeferred.fulfill([request.post.calls.mostRecent().args[0].json]);
                    process.nextTick(done);
                });

                it('should produce an event into the watchman stream', function() {
                    expect(watchmanStream.produce).toHaveBeenCalledWith({
                        type: 'chargedPaymentPlan',
                        data: {
                            org: data.org,
                            paymentPlan: data.paymentPlan,
                            payment: postPaymentDeferred.promise.inspect().value[0]
                        }
                    });
                });

                describe('if producing the event fails', function() {
                    var reason;

                    beforeEach(function(done) {
                        reason = new Error('It went wrong!');
                        produceDeferred.reject(reason);

                        process.nextTick(done);
                    });

                    it('should reject the promise', function() {
                        expect(failure).toHaveBeenCalledWith(reason);
                    });
                });

                describe('if producing the event succeeds', function() {
                    beforeEach(function(done) {
                        produceDeferred.fulfill(watchmanStream.produce.calls.mostRecent().args[0]);
                        process.nextTick(done);
                    });

                    it('should fulfill with undefined', function() {
                        expect(success).toHaveBeenCalledWith(undefined);
                    });
                });
            });

            describe('if the request fails', function() {
                var reason;

                describe('for a random reason', function() {
                    beforeEach(function(done) {
                        reason = new SyntaxError('You suck at typing...');
                        postPaymentDeferred.reject(reason);

                        process.nextTick(done);
                    });

                    it('should reject the promise', function() {
                        expect(failure).toHaveBeenCalledWith(reason);
                    });

                    it('should not produce anything to the watchman stream', function() {
                        expect(watchmanStream.produce).not.toHaveBeenCalled();
                    });
                });

                describe('with a StatusCodeError', function() {
                    [500, 501, 504, 505].forEach(function(statusCode) {
                        describe('of ' + statusCode, function() {
                            beforeEach(function(done) {
                                reason = new Error(statusCode + ' - INTERNAL ERROR');
                                reason.name = 'StatusCodeError';
                                reason.statusCode = statusCode;

                                postPaymentDeferred.reject(reason);
                                process.nextTick(done);
                            });

                            it('should reject the promise', function() {
                                expect(failure).toHaveBeenCalledWith(reason);
                            });

                            it('should not produce anything to the watchman stream', function() {
                                expect(watchmanStream.produce).not.toHaveBeenCalled();
                            });
                        });
                    });

                    [400, 404, 403].forEach(function(statusCode) {
                        describe('of ' + statusCode, function() {
                            var produceDeferred;

                            beforeEach(function(done) {
                                reason = new Error(statusCode + ' - No dice!');
                                reason.name = 'StatusCodeError';
                                reason.statusCode = statusCode;

                                watchmanStream.produce.and.returnValue((produceDeferred = q.defer()).promise);

                                postPaymentDeferred.reject(reason);
                                process.nextTick(done);
                            });

                            it('should not resolve the promise', function() {
                                expect(failure).not.toHaveBeenCalled();
                                expect(success).not.toHaveBeenCalled();
                            });

                            it('should produce a record into the watchman stream', function() {
                                expect(watchmanStream.produce).toHaveBeenCalledWith({
                                    type: 'chargePaymentPlanFailure',
                                    data: {
                                        org: data.org,
                                        paymentPlan: data.paymentPlan,
                                        paymentMethod: data.paymentMethod
                                    }
                                });
                            });

                            describe('if producing the event fails', function() {
                                var reason;

                                beforeEach(function(done) {
                                    reason = new Error('It didn\'t work!');
                                    produceDeferred.reject(reason);

                                    process.nextTick(done);
                                });

                                it('should reject the promise', function() {
                                    expect(failure).toHaveBeenCalledWith(reason);
                                });
                            });

                            describe('if producing the event succeeds', function() {
                                beforeEach(function(done) {
                                    produceDeferred.fulfill(watchmanStream.produce.calls.mostRecent().args[0]);
                                    process.nextTick(done);
                                });

                                it('should fulfill with undefined', function() {
                                    expect(success).toHaveBeenCalledWith(undefined);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});