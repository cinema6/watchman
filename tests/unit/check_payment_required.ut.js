'use strict';

describe('(action factory) check_payment_required', function() {
    let JsonProducer, CwrxRequest;
    let uuid, q, resolveURL, moment, parseURL;
    let factory;

    beforeAll(function() {
        Object.keys(require.cache).forEach(function(dep) {
            delete require.cache[dep];
        });

        uuid = require('rc-uuid');
        q = require('q');
        resolveURL = require('url').resolve;
        moment = require('moment');
        parseURL = require('url').parse;

        JsonProducer = (function(JsonProducer) {
            return jasmine.createSpy('JsonProducer()').and.callFake(function(name, options) {
                let producer = new JsonProducer(name, options);

                spyOn(producer, 'produce').and.returnValue(q.defer().promise);

                return producer;
            });
        }(require('rc-kinesis').JsonProducer));
        require.cache[require.resolve('rc-kinesis')].exports.JsonProducer = JsonProducer;

        CwrxRequest = (function(CwrxRequest) {
            return jasmine.createSpy('CwrxRequest()').and.callFake(function(creds) {
                let request = new CwrxRequest(creds);

                spyOn(request, 'send').and.returnValue(q.defer().promise);

                return request;
            });
        }(require('../../lib/CwrxRequest')));
        require.cache[require.resolve('../../lib/CwrxRequest')].exports = CwrxRequest;

        factory = require('../../src/actions/check_payment_required');
    });

    it('should exist', function() {
        expect(factory).toEqual(jasmine.any(Function));
    });

    describe('when called', function() {
        let config;
        let checkPaymentRequired;
        let watchmanStream, request;

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
                        },
                        orgs: {
                            endpoint: '/api/account/orgs'
                        },
                        paymentPlans: {
                            endpoint: '/api/payment-plans'
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
        });

        it('should create a JsonProducer for watchman', function() {
            expect(JsonProducer).toHaveBeenCalledWith(config.kinesis.producer.stream, config.kinesis.producer);
        });

        it('should create a CwrxRequest', function() {
            expect(CwrxRequest).toHaveBeenCalledWith(config.appCreds);
        });

        describe('the action', function() {
            let success, failure;
            let now, data, options, event;
            let paymentMethod, paymentPlan;

            beforeEach(function() {
                now = moment(new Date(2016, 3, 15));

                data = {
                    org: {
                        id: 'o-' + uuid.createUuid(),
                        paymentPlanStart: now.format(),
                        paymentPlanId: 'pp-0Ek5Na02vCohpPgw'
                    },
                    date: now.format()
                };
                options = {};
                event = { data: data, options: options };

                success = jasmine.createSpy('success()');
                failure = jasmine.createSpy('failure()');

                spyOn(request, 'get').and.returnValue(q.defer().promise);
            });

            describe('if the org has no nextPaymentDate', function() {
                beforeEach(function(done) {
                    delete data.org.nextPaymentDate;
                    data.org.paymentPlanId = 'pp-0Ek5Na02vCohpPgw';

                    checkPaymentRequired(event).then(success, failure);
                    setTimeout(done);
                });

                it('should not fetch any payments', function() {
                    expect(request.get).not.toHaveBeenCalled();
                });

                it('should return a promise resolved to undefined', function() {
                    expect(success).toHaveBeenCalledWith(undefined);
                });
            });

            describe('if the org has a nextPaymentDate', function() {
                beforeEach(function() {
                    paymentMethod = { token: uuid.createUuid(), default: true };
                    paymentPlan = {
                        label: 'Starter',
                        price: 49.99,
                        maxCampaigns: 1,
                        viewsPerMonth: 2000,
                        id: 'pp-0Ekdsm05KVZ43Aqj',
                        created: '2016-07-05T14:18:29.642Z',
                        lastUpdated: '2016-07-05T14:28:57.336Z',
                        status: 'active'
                    };
                });

                describe('that is after today', function() {
                    beforeEach(function(done) {
                        data.org.nextPaymentDate = moment(data.date).add(1, 'day').format();

                        checkPaymentRequired(event).then(success, failure);
                        setTimeout(done);
                    });

                    it('should not GET anything', function() {
                        expect(request.get).not.toHaveBeenCalled();
                    });

                    it('should not produce anything', function() {
                        expect(watchmanStream.produce).not.toHaveBeenCalled();
                    });

                    it('should fulfill the promise', function() {
                        expect(success).toHaveBeenCalledWith(undefined);
                    });
                });

                [
                    {
                        description: 'that is today',
                        dateOffset: 0
                    },
                    {
                        description: 'that is before today',
                        dateOffset: 1
                    }
                ].forEach(testConfig => describe(testConfig.description, function() {
                    let getPaymentMethodsDeferred, getPaymentPlanDeferred;

                    beforeEach(function(done) {
                        data.org.nextPaymentDate = moment(data.date).subtract(testConfig.dateOffset, 'days').format();

                        request.get.and.callFake(requestConfig => {
                            const url = parseURL(requestConfig.url);

                            if (url.pathname.indexOf(config.cwrx.api.paymentPlans.endpoint) > -1) {
                                return (getPaymentPlanDeferred = q.defer()).promise;
                            }

                            if (url.pathname.indexOf(config.cwrx.api.payments.endpoint) > -1) {
                                return (getPaymentMethodsDeferred = q.defer()).promise;
                            }

                            return q.reject(new Error('NOT FOUND!'));
                        });

                        checkPaymentRequired(event).then(success, failure);
                        setTimeout(done);
                    });

                    it('should get the org\'s payment methods', function() {
                        expect(request.get).toHaveBeenCalledWith({
                            url: resolveURL(resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint), 'methods'),
                            qs: { org: data.org.id }
                        });
                    });

                    it('should get the org\'s payment plan', function() {
                        expect(request.get).toHaveBeenCalledWith({
                            url: `${resolveURL(config.cwrx.api.root, config.cwrx.api.paymentPlans.endpoint)}/${data.org.paymentPlanId}`
                        });
                    });

                    describe('if the org has no payment methods', function() {
                        let paymentMethods;

                        beforeEach(function(done) {
                            paymentMethods = [];

                            getPaymentMethodsDeferred.fulfill([paymentMethods]);
                            getPaymentPlanDeferred.fulfill([{}]);
                            setTimeout(done);
                        });

                        it('should not produce anything into the watchman stream', function() {
                            expect(watchmanStream.produce).not.toHaveBeenCalled();
                        });

                        it('should reject the Promise', function() {
                            expect(failure).toHaveBeenCalledWith(new Error('Org ' + data.org.id + ' has no payment methods.'));
                        });
                    });

                    describe('if getting the payment methods fails', function() {
                        let reason;

                        beforeEach(function(done) {
                            reason = new Error('Something went very wrong...');
                            getPaymentMethodsDeferred.reject(reason);

                            setTimeout(done);
                        });

                        it('should reject the promise', function() {
                            expect(failure).toHaveBeenCalledWith(reason);
                        });
                    });

                    describe('if getting the payment plan fails', function() {
                        let reason;

                        beforeEach(function(done) {
                            reason = new Error('Something went very wrong...');
                            getPaymentPlanDeferred.reject(reason);

                            setTimeout(done);
                        });

                        it('should reject the promise', function() {
                            expect(failure).toHaveBeenCalledWith(reason);
                        });
                    });

                    describe('if the org has a default paymentMethod', function() {
                        beforeEach(function(done) {
                            getPaymentMethodsDeferred.resolve([
                                [
                                    { token: uuid.createUuid(), default: false },
                                    paymentMethod,
                                    { token: uuid.createUuid(), default: false }
                                ],
                                { statusCode: 200 }
                            ]);
                            getPaymentPlanDeferred.resolve([
                                paymentPlan,
                                { statusCode: 200 }
                            ]);

                            setTimeout(done);
                        });

                        it('should add a record to the watchman stream', function() {
                            expect(watchmanStream.produce).toHaveBeenCalledWith({
                                type: 'paymentRequired',
                                data: {
                                    paymentPlan,
                                    paymentMethod,
                                    org: data.org,
                                    date: data.date
                                }
                            });
                        });
                    });
                }));
            });
        });
    });
});
