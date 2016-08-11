'use strict';

const proxyquire = require('proxyquire');

describe('(action factory) check_plan_upgrade', () => {
    let q, uuid, resolveURL, moment, logger;
    let JsonProducer, CwrxRequest;
    let factory;

    beforeAll(() => {
        q = require('q');
        uuid = require('rc-uuid');
        resolveURL = require('url').resolve;
        moment = require('moment');
        logger = require('cwrx/lib/logger');
    });

    beforeEach(() => {
        JsonProducer = (function(JsonProducer) {
            return jasmine.createSpy('JsonProducer()').and.callFake(function(name, options) {
                let producer = new JsonProducer(name, options);

                spyOn(producer, 'produce').and.returnValue(q.defer().promise);

                return producer;
            });
        }(require('rc-kinesis').JsonProducer));

        CwrxRequest = (function(CwrxRequest) {
            return jasmine.createSpy('CwrxRequest()').and.callFake(function(creds) {
                let request = new CwrxRequest(creds);

                spyOn(request, 'send').and.returnValue(q.defer().promise);

                return request;
            });
        }(require('../../lib/CwrxRequest')));

        factory = proxyquire('../../src/actions/check_plan_upgrade', {
            'rc-kinesis': {
                JsonProducer
            },
            '../../lib/CwrxRequest': CwrxRequest
        });
    });

    it('should exist', () => {
        expect(factory).toEqual(jasmine.any(Function));
    });

    describe('when called', () => {
        let config;
        let paymentPlansEndpoint;
        let transactionsEndpoint;
        let paymentMethodsEndpoint;
        let action;
        let request, watchmanStream, log;

        beforeEach(() => {
            config = {
                appCreds: {
                    key: 'watchman-dev',
                    secret: 'dwei9fhj3489ghr7834909r'
                },
                cwrx: {
                    api: {
                        root: 'http://33.33.33.10/',
                        paymentPlans: {
                            endpoint: '/api/payment-plans'
                        },
                        transactions: {
                            endpoint: '/api/transactions'
                        },
                        orgs: {
                            endpoint: '/api/account/orgs'
                        },
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

            paymentPlansEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.paymentPlans.endpoint);
            transactionsEndpoint = `${resolveURL(config.cwrx.api.root, config.cwrx.api.transactions.endpoint)}/showcase/current-payment`;
            paymentMethodsEndpoint = `${resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint)}methods`;

            spyOn(logger, 'getLog').and.returnValue(log = jasmine.createSpyObj('log', [
                'info',
                'trace',
                'warn',
                'error'
            ]));

            action = factory(config);

            request = CwrxRequest.calls.mostRecent().returnValue;
            watchmanStream = JsonProducer.calls.mostRecent().returnValue;
        });

        it('should return the action Function', () => {
            expect(action).toEqual(jasmine.any(Function));
        });

        it('should create a JsonProducer for watchman', () => {
            expect(JsonProducer).toHaveBeenCalledWith(config.kinesis.producer.stream, config.kinesis.producer);
        });

        it('should create a CwrxRequest', () => {
            expect(CwrxRequest).toHaveBeenCalledWith(config.appCreds);
        });

        describe('the action', () => {
            let data, options, event;
            let previousPlanDeferred;
            let currentPlanDeferred;
            let cycleDeferred;
            let paymentMethodsDeferred;
            let success, failure;

            beforeEach(done => {
                data = {
                    org: {
                        id: 'o-' + uuid.createUuid()
                    },
                    previousPaymentPlanId: `pp-${uuid.createUuid()}`,
                    currentPaymentPlanId: `pp-${uuid.createUuid()}`,
                    paymentMethod: {
                        token: uuid.createUuid(),
                        default: true
                    },
                    date: moment('2016-08-12T10:22:11Z').utcOffset(0).format()
                };
                options = {};
                event = { data: data, options: options };

                success = jasmine.createSpy('success()');
                failure = jasmine.createSpy('failure()');

                previousPlanDeferred = q.defer();
                currentPlanDeferred = q.defer();
                cycleDeferred = q.defer();
                paymentMethodsDeferred = q.defer();

                spyOn(request, 'get').and.callFake(config => {
                    switch (config.url) {
                    case `${paymentPlansEndpoint}/${data.previousPaymentPlanId}`:
                        return previousPlanDeferred.promise;
                    case `${paymentPlansEndpoint}/${data.currentPaymentPlanId}`:
                        return currentPlanDeferred.promise;
                    case transactionsEndpoint:
                        return cycleDeferred.promise;
                    case paymentMethodsEndpoint:
                        return paymentMethodsDeferred.promise;
                    default:
                        return q.reject(new Error(`Unknown URL: ${config.url}`));
                    }
                });

                action(event).then(success, failure);
                setTimeout(done);
            });

            it('should fetch the current and previous payment plans', () => {
                expect(request.get.calls.count()).toBe(2);
                expect(request.get).toHaveBeenCalledWith({
                    url: `${paymentPlansEndpoint}/${data.previousPaymentPlanId}`
                });
                expect(request.get).toHaveBeenCalledWith({
                    url: `${paymentPlansEndpoint}/${data.currentPaymentPlanId}`
                });
            });

            describe('if a plan cannot be fetched', () => {
                let reason;

                beforeEach(done => {
                    reason = new Error('Something bad happened!');
                    currentPlanDeferred.reject(reason);
                    setTimeout(done);
                });

                it('should log.error()', () => {
                    expect(log.error).toHaveBeenCalled();
                });

                it('should fulfill with undefined', () => {
                    expect(success).toHaveBeenCalledWith(undefined);
                });
            });

            describe('if the user is upgrading', () => {
                let currentPlan;
                let previousPlan;

                beforeEach(done => {
                    currentPlan = {
                        id: data.currentPaymentPlanId,
                        price: 149.99
                    };
                    previousPlan = {
                        id: data.previousPaymentPlanId,
                        price: 49.99
                    };

                    currentPlanDeferred.resolve([currentPlan, { statusCode: 200 }]);
                    previousPlanDeferred.resolve([previousPlan, { statusCode: 200 }]);
                    setTimeout(done);
                    request.get.calls.reset();
                });

                it('should get the current billing cycle and paymentMethods', () => {
                    expect(request.get.calls.count()).toBe(2);
                    expect(request.get).toHaveBeenCalledWith({ url: transactionsEndpoint, qs: { org: data.org.id } });
                    expect(request.get).toHaveBeenCalledWith({ url: paymentMethodsEndpoint, qs: { org: data.org.id } });
                });

                describe('if something cannot be fetched', () => {
                    let reason;

                    beforeEach(done => {
                        reason = new Error('Something bad happened!');
                        cycleDeferred.reject(reason);
                        setTimeout(done);
                    });

                    it('should log.error()', () => {
                        expect(log.error).toHaveBeenCalled();
                    });

                    it('should fulfill with undefined', () => {
                        expect(success).toHaveBeenCalledWith(undefined);
                    });
                });

                describe('if the user has no default payment method', () => {
                    let cycle;
                    let paymentMethod;
                    let paymentMethods;
                    let produceDeferred;

                    beforeEach(done => {
                        cycle = {
                            cycleStart: moment('2016-07-27T00:00:00Z0').format(),
                            cycleEnd: moment('2016-08-26T23:59:59Z0').format(),
                            amount: 299.99
                        };

                        paymentMethod = {
                            default: false,
                            token: uuid.createUuid()
                        };

                        paymentMethods = [
                            {
                                default: false,
                                token: uuid.createUuid()
                            },
                            paymentMethod,
                            {
                                default: false,
                                token: uuid.createUuid()
                            }
                        ];

                        produceDeferred = q.defer();
                        watchmanStream.produce.and.returnValue(produceDeferred.promise);

                        cycleDeferred.resolve([cycle, { statusCode: 200 }]);
                        paymentMethodsDeferred.resolve([paymentMethods, { statusCode: 200 }]);
                        setTimeout(done);
                    });

                    it('should not produce anything', () => {
                        expect(watchmanStream.produce).not.toHaveBeenCalled();
                    });

                    it('should log.error()', () => {
                        expect(log.error).toHaveBeenCalled();
                    });

                    it('should fulfill with undefined', () => {
                        expect(success).toHaveBeenCalledWith(undefined);
                    });
                });

                describe('when the billing cycle and paymentMethods are fetched', () => {
                    let cycle;
                    let paymentMethod;
                    let paymentMethods;
                    let produceDeferred;

                    beforeEach(done => {
                        cycle = {
                            cycleStart: moment('2016-07-27T00:00:00Z0').format(),
                            cycleEnd: moment('2016-08-26T23:59:59Z0').format(),
                            amount: 299.99
                        };

                        paymentMethod = {
                            default: true,
                            token: uuid.createUuid()
                        };

                        paymentMethods = [
                            {
                                default: false,
                                token: uuid.createUuid()
                            },
                            paymentMethod,
                            {
                                default: false,
                                token: uuid.createUuid()
                            }
                        ];

                        produceDeferred = q.defer();
                        watchmanStream.produce.and.returnValue(produceDeferred.promise);

                        cycleDeferred.resolve([cycle, { statusCode: 200 }]);
                        paymentMethodsDeferred.resolve([paymentMethods, { statusCode: 200 }]);
                        setTimeout(done);
                    });

                    it('should produce a "paymentRequired" record', () => {
                        expect(watchmanStream.produce).toHaveBeenCalledWith({
                            type: 'paymentRequired',
                            data: {
                                paymentMethod,
                                org: data.org,
                                paymentPlan: currentPlan,
                                date: data.date,
                                discount: 140.98
                            }
                        });
                    });

                    describe('if the record cannot be produced', () => {
                        let reason;

                        beforeEach(done => {
                            reason = new Error('Something bad happened!');
                            produceDeferred.reject(reason);
                            setTimeout(done);
                        });

                        it('should log.error()', () => {
                            expect(log.error).toHaveBeenCalled();
                        });

                        it('should fulfill with undefined', () => {
                            expect(success).toHaveBeenCalledWith(undefined);
                        });
                    });

                    describe('when the record is produced', () => {
                        beforeEach(done => {
                            produceDeferred.resolve(watchmanStream.produce.calls.mostRecent().args[0]);
                            setTimeout(done);
                        });

                        it('should fulfill with undefined', () => {
                            expect(success).toHaveBeenCalledWith(undefined);
                        });
                    });
                });
            });

            describe('if the user is downgrading', () => {
                let currentPlan;
                let previousPlan;

                beforeEach(done => {
                    currentPlan = {
                        id: data.currentPaymentPlanId,
                        price: 49.99
                    };
                    previousPlan = {
                        id: data.previousPaymentPlanId,
                        price: 149.99
                    };

                    currentPlanDeferred.resolve([currentPlan, { statusCode: 200 }]);
                    previousPlanDeferred.resolve([previousPlan, { statusCode: 200 }]);
                    setTimeout(done);
                    request.get.calls.reset();
                });

                it('should not GET anything', () => {
                    expect(request.get).not.toHaveBeenCalled();
                });

                it('should not produce anything', () => {
                    expect(watchmanStream.produce).not.toHaveBeenCalled();
                });

                it('should fulfill with undefined', () => {
                    expect(success).toHaveBeenCalledWith(undefined);
                });
            });

            describe('if the user is initializing a payment plan', () => {
                beforeEach(done => {
                    success.calls.reset();
                    failure.calls.reset();
                    request.get.calls.reset();

                    data.previousPaymentPlanId = null;

                    action(event).then(success, failure);
                    setTimeout(done);
                });

                it('should not GET anything', () => {
                    expect(request.get).not.toHaveBeenCalled();
                });

                it('should not produce anything', () => {
                    expect(watchmanStream.produce).not.toHaveBeenCalled();
                });

                it('should fulfill with undefined', () => {
                    expect(success).toHaveBeenCalledWith(undefined);
                });
            });
        });
    });
});
