'use strict';

describe('(action factory) check_payment_required', function() {
    var JsonProducer, CwrxRequest;
    var uuid, q, MockObjectStore, resolveURL, moment;
    var factory;

    beforeEach(function() {
        Object.keys(require.cache).forEach(function(dep) {
            delete require.cache[dep];
        });

        uuid = require('rc-uuid');
        q = require('q');
        MockObjectStore = require('../helpers/MockObjectStore');
        resolveURL = require('url').resolve;
        moment = require('moment');

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

        factory = require('../../src/actions/check_payment_required');
    });

    it('should exist', function() {
        expect(factory).toEqual(jasmine.any(Function));
        expect(factory.name).toEqual('checkPaymentRequiredFactory');
    });

    describe('when called', function() {
        var config;
        var checkPaymentRequired;
        var watchmanStream, request;

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
                },
                paymentPlans: {
                    'pp-0Ek5Na02vCohpPgw': {
                        price: 49.99
                    }
                }
            };

            checkPaymentRequired = factory(config);

            watchmanStream = JsonProducer.calls.mostRecent().returnValue;
            request = CwrxRequest.calls.mostRecent().returnValue;
        });

        it('should return the action', function() {
            expect(checkPaymentRequired).toEqual(jasmine.any(Function));
            expect(checkPaymentRequired.name).toBe('checkPaymentRequired');
        });

        it('should create a JsonProducer for watchman', function() {
            expect(JsonProducer).toHaveBeenCalledWith(config.kinesis.producer.stream, config.kinesis.producer);
        });

        it('should create a CwrxRequest', function() {
            expect(CwrxRequest).toHaveBeenCalledWith(config.appCreds);
        });

        describe('the action', function() {
            var data, options, event;
            var getPaymentsDeferred;
            var result;

            beforeEach(function() {
                data = {
                    org: {
                        id: 'o-' + uuid.createUuid()
                    },
                    date: new Date(2016, 3, 15).toISOString()
                };
                options = {};
                event = { data: data, options: options };

                spyOn(request, 'get').and.returnValue((getPaymentsDeferred = q.defer()).promise);
            });

            describe('if the org has no paymentPlanId', function() {
                beforeEach(function(done) {
                    data.org.paymentPlanId = null;

                    result = checkPaymentRequired(event);
                    process.nextTick(done);
                });

                it('should not fetch any payments', function() {
                    expect(request.get).not.toHaveBeenCalled();
                });

                it('should return a promise resolved to undefined', function() {
                    expect(result.inspect().value).toBeUndefined();
                    expect(result.inspect().state).toBe('fulfilled');
                });
            });

            describe('if the org has a paymentPlanId', function() {
                describe('that is not recognized', function() {
                    beforeEach(function(done) {
                        data.org.paymentPlanId = 'pp-0GK9j102W6Cc9VNu';

                        result = checkPaymentRequired(event);
                        process.nextTick(done);
                    });

                    it('should not fetch any payments', function() {
                        expect(request.get).not.toHaveBeenCalled();
                    });

                    it('should return a promise resolved to undefined', function() {
                        expect(result.inspect().value).toBeUndefined();
                        expect(result.inspect().state).toBe('fulfilled');
                    });
                });

                describe('that is recognized', function() {
                    var success, failure;

                    beforeEach(function(done) {
                        data.org.paymentPlanId = 'pp-0Ek5Na02vCohpPgw';

                        success = jasmine.createSpy('success()');
                        failure = jasmine.createSpy('failure()');

                        checkPaymentRequired(event).then(success, failure);
                        process.nextTick(done);
                    });

                    it('should request payments for the org', function() {
                        expect(request.get).toHaveBeenCalledWith({
                            url: resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint),
                            qs: { org: data.org.id }
                        });
                    });

                    describe('if the request for payments fails', function() {
                        var reason;

                        beforeEach(function(done) {
                            reason = new Error('I failed!');
                            getPaymentsDeferred.reject(reason);

                            process.nextTick(done);
                        });

                        it('should reject the promise', function() {
                            expect(failure).toHaveBeenCalledWith(reason);
                        });
                    });

                    describe('if the request is successful', function() {
                        var produceDeferred;
                        var payments;
                        var paymentMethod;

                        beforeEach(function() {
                            watchmanStream.produce.and.returnValue((produceDeferred = q.defer()).promise);
                        });

                        describe('and the last successful payment was', function() {
                            beforeEach(function() {
                                paymentMethod = { token: uuid.createUuid(), default: true };
                                request.get.and.returnValue(q([
                                    [
                                        { token: uuid.createUuid(), default: false },
                                        paymentMethod,
                                        { token: uuid.createUuid(), default: false }
                                    ]
                                ]));
                                request.get.calls.reset();

                                watchmanStream.produce.and.callFake(function(event) { return q(event); });
                            });

                            describe('created on a month that is longer than the current one', function() {
                                beforeEach(function() {
                                    data.date = new Date(2015, 1, 15).toISOString();

                                    payments = [
                                        {
                                            id: uuid.createUuid(),
                                            status: 'settled',
                                            amount: 49.99,
                                            createdAt: moment('2015-01-30').format()
                                        },
                                        {
                                            id: uuid.createUuid(),
                                            status: 'settled',
                                            amount: 49.99,
                                            createdAt: moment('2014-12-30').format()
                                        }
                                    ];
                                });

                                describe('before the last day of the month', function() {
                                    beforeEach(function(done) {
                                        data.date = new Date(2015, 1, 27).toISOString();

                                        getPaymentsDeferred.fulfill([payments]);
                                        process.nextTick(done);
                                    });

                                    it('should not get any payment methods', function() {
                                        expect(request.get).not.toHaveBeenCalled();
                                    });

                                    it('should not add any records to the watchman stream', function() {
                                        expect(watchmanStream.produce).not.toHaveBeenCalled();
                                    });

                                    it('should fulfill the promise', function() {
                                        expect(success).toHaveBeenCalledWith(undefined);
                                    });
                                });

                                describe('on the last day of the month', function() {
                                    beforeEach(function(done) {
                                        data.date = new Date(2015, 1, 28).toISOString();

                                        getPaymentsDeferred.fulfill([payments]);
                                        process.nextTick(done);
                                    });

                                    it('should get the orgs payment methods', function() {
                                        expect(request.get).toHaveBeenCalledWith({
                                            url: resolveURL(resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint), 'methods'),
                                            qs: { org: data.org.id }
                                        });
                                    });

                                    it('should add a record to the watchman stream', function() {
                                        expect(watchmanStream.produce).toHaveBeenCalledWith({
                                            type: 'paymentRequired',
                                            data: {
                                                org: data.org,
                                                paymentPlan: config.paymentPlans[data.org.paymentPlanId],
                                                paymentMethod: paymentMethod
                                            }
                                        });
                                    });

                                    it('should fulfill the promise', function() {
                                        expect(success).toHaveBeenCalledWith(undefined);
                                    });
                                });
                            });

                            describe('less then a month ago', function() {
                                beforeEach(function(done) {
                                    payments = [
                                        {
                                            id: uuid.createUuid(),
                                            status: 'settled',
                                            amount: 49.99,
                                            createdAt: moment(data.date).subtract(1, 'month')
                                                .add(1, 'day')
                                                .format()
                                        },
                                        {
                                            id: uuid.createUuid(),
                                            status: 'settled',
                                            amount: 49.99,
                                            createdAt: moment(data.date).subtract(2, 'month')
                                                .add(1, 'day')
                                                .format()
                                        }
                                    ];
                                    getPaymentsDeferred.fulfill([payments]);

                                    process.nextTick(done);
                                });

                                it('should not get any payment methods', function() {
                                    expect(request.get).not.toHaveBeenCalled();
                                });

                                it('should not add any records to the watchman stream', function() {
                                    expect(watchmanStream.produce).not.toHaveBeenCalled();
                                });

                                it('should fulfill the promise', function() {
                                    expect(success).toHaveBeenCalledWith(undefined);
                                });
                            });

                            describe('one month ago', function() {
                                beforeEach(function(done) {
                                    payments = [
                                        {
                                            id: uuid.createUuid(),
                                            status: 'settled',
                                            amount: 49.99,
                                            createdAt: moment(data.date).subtract(1, 'month')
                                                .format()
                                        },
                                        {
                                            id: uuid.createUuid(),
                                            status: 'settled',
                                            amount: 49.99,
                                            createdAt: moment(data.date).subtract(2, 'month')
                                                .format()
                                        }
                                    ];
                                    getPaymentsDeferred.fulfill([payments]);

                                    process.nextTick(done);
                                });

                                it('should get the orgs payment methods', function() {
                                    expect(request.get).toHaveBeenCalledWith({
                                        url: resolveURL(resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint), 'methods'),
                                        qs: { org: data.org.id }
                                    });
                                });

                                it('should add a record to the watchman stream', function() {
                                    expect(watchmanStream.produce).toHaveBeenCalledWith({
                                        type: 'paymentRequired',
                                        data: {
                                            org: data.org,
                                            paymentPlan: config.paymentPlans[data.org.paymentPlanId],
                                            paymentMethod: paymentMethod
                                        }
                                    });
                                });

                                it('should fulfill the promise', function() {
                                    expect(success).toHaveBeenCalledWith(undefined);
                                });
                            });

                            describe('over a month ago', function() {
                                beforeEach(function(done) {
                                    payments = [
                                        {
                                            id: uuid.createUuid(),
                                            status: 'rejected',
                                            amount: 49.99,
                                            createdAt: moment(data.date).subtract(1, 'day')
                                                .format()
                                        },
                                        {
                                            id: uuid.createUuid(),
                                            status: 'settled',
                                            amount: 49.99,
                                            createdAt: moment(data.date).subtract(1, 'month')
                                                .subtract(1, 'day')
                                                .format()
                                        },
                                        {
                                            id: uuid.createUuid(),
                                            status: 'settled',
                                            amount: 49.99,
                                            createdAt: moment(data.date).subtract(2, 'month')
                                                .subtract(1, 'day')
                                                .format()
                                        }
                                    ];
                                    getPaymentsDeferred.fulfill([payments]);

                                    process.nextTick(done);
                                });

                                it('should get the orgs payment methods', function() {
                                    expect(request.get).toHaveBeenCalledWith({
                                        url: resolveURL(resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint), 'methods'),
                                        qs: { org: data.org.id }
                                    });
                                });

                                it('should add a record to the watchman stream', function() {
                                    expect(watchmanStream.produce).toHaveBeenCalledWith({
                                        type: 'paymentRequired',
                                        data: {
                                            org: data.org,
                                            paymentPlan: config.paymentPlans[data.org.paymentPlanId],
                                            paymentMethod: paymentMethod
                                        }
                                    });
                                });

                                it('should fulfill the promise', function() {
                                    expect(success).toHaveBeenCalledWith(undefined);
                                });
                            });
                        });

                        describe('and no payments were made', function() {
                            var getPaymentMethodsDeferred;

                            beforeEach(function(done) {
                                payments = [];
                                getPaymentsDeferred.fulfill([payments]);

                                request.get.and.returnValue((getPaymentMethodsDeferred = q.defer()).promise);

                                process.nextTick(done);
                            });

                            it('should get the orgs payment methods', function() {
                                expect(request.get).toHaveBeenCalledWith({
                                    url: resolveURL(resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint), 'methods'),
                                    qs: { org: data.org.id }
                                });
                            });

                            describe('if getting the payment methods succeeds', function() {
                                var paymentMethods;

                                describe('and the org has payment methods', function() {
                                    beforeEach(function(done) {
                                        paymentMethods = [
                                            { token: uuid.createUuid(), default: false },
                                            { token: uuid.createUuid(), default: true },
                                            { token: uuid.createUuid(), default: false }
                                        ];
                                        getPaymentMethodsDeferred.fulfill([paymentMethods]);
                                        process.nextTick(done);
                                    });

                                    it('should add a record to the watchman stream', function() {
                                        expect(watchmanStream.produce).toHaveBeenCalledWith({
                                            type: 'paymentRequired',
                                            data: {
                                                org: data.org,
                                                paymentPlan: config.paymentPlans[data.org.paymentPlanId],
                                                paymentMethod: paymentMethods[1]
                                            }
                                        });
                                    });

                                    describe('if producing the event succeeds', function() {
                                        beforeEach(function(done) {
                                            produceDeferred.fulfill(watchmanStream.produce.calls.mostRecent().args[0]);
                                            process.nextTick(done);
                                        });

                                        it('should fulfill the promise', function() {
                                            expect(success).toHaveBeenCalledWith(undefined);
                                        });
                                    });

                                    describe('if producing the event fails', function() {
                                        var reason;

                                        beforeEach(function(done) {
                                            reason = new Error('Something went wrong!');
                                            produceDeferred.reject(reason);

                                            process.nextTick(done);
                                        });

                                        it('should reject the promise', function() {
                                            expect(failure).toHaveBeenCalledWith(reason);
                                        });
                                    });
                                });

                                describe('and the org has no payment methods', function() {
                                    var paymentMethods;

                                    beforeEach(function(done) {
                                        paymentMethods = [];

                                        getPaymentMethodsDeferred.fulfill([paymentMethods]);
                                        process.nextTick(done);
                                    });

                                    it('should not produce anything into the watchman stream', function() {
                                        expect(watchmanStream.produce).not.toHaveBeenCalled();
                                    });

                                    it('should reject the Promise', function() {
                                        expect(failure).toHaveBeenCalledWith(new Error('Org ' + data.org.id + ' has no payment methods.'));
                                    });
                                });
                            });

                            describe('if getting the payment methods fails', function() {
                                var reason;

                                beforeEach(function(done) {
                                    reason = new Error('Something went very wrong...');
                                    getPaymentMethodsDeferred.reject(reason);

                                    process.nextTick(done);
                                });

                                it('should reject the promise', function() {
                                    expect(failure).toHaveBeenCalledWith(reason);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});