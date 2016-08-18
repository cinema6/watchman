'use strict';

const proxyquire = require('proxyquire');

describe('(action factory) charge_payment_plan', function() {
    let q, uuid, resolveURL, ld, moment, logger;
    let JsonProducer, CwrxRequest;
    let factory;

    beforeAll(function() {
        q = require('q');
        uuid = require('rc-uuid');
        resolveURL = require('url').resolve;
        ld = require('lodash');
        moment = require('moment');
        logger = require('cwrx/lib/logger');
    });

    beforeEach(function() {
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

        factory = proxyquire('../../src/actions/charge_payment_plan', {
            'rc-kinesis': {
                JsonProducer
            },
            '../../lib/CwrxRequest': CwrxRequest
        });
    });

    it('should exist', function() {
        expect(factory).toEqual(jasmine.any(Function));
    });

    describe('when called', function() {
        let config;
        let chargePaymentPlan;
        let request, watchmanStream, log;

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

            spyOn(logger, 'getLog').and.returnValue(log = jasmine.createSpyObj('log', [
                'info',
                'trace',
                'warn',
                'error'
            ]));

            chargePaymentPlan = factory(config);

            request = CwrxRequest.calls.mostRecent().returnValue;
            watchmanStream = JsonProducer.calls.mostRecent().returnValue;
        });

        it('should return the action Function', function() {
            expect(chargePaymentPlan).toEqual(jasmine.any(Function));
        });

        it('should create a JsonProducer for watchman', function() {
            expect(JsonProducer).toHaveBeenCalledWith(config.kinesis.producer.stream, config.kinesis.producer);
        });

        it('should create a CwrxRequest', function() {
            expect(CwrxRequest).toHaveBeenCalledWith(config.appCreds);
        });

        describe('the action', function() {
            let data, options, event;
            let postPaymentDeferred;
            let success, failure;

            beforeEach(function(done) {
                data = {
                    org: {
                        id: 'o-' + uuid.createUuid()
                    },
                    paymentPlan: {
                        label: 'Starter',
                        price: 49.99,
                        maxCampaigns: 1,
                        viewsPerMonth: 2000,
                        id: 'pp-0Ekdsm05KVZ43Aqj',
                        created: '2016-07-05T14:18:29.642Z',
                        lastUpdated: '2016-07-05T14:28:57.336Z',
                        status: 'active'
                    },
                    paymentMethod: {
                        token: uuid.createUuid(),
                        default: true
                    },
                    date: moment().format()
                };
                options = {
                    target: 'showcase'
                };
                event = { data: data, options: options };

                success = jasmine.createSpy('success()');
                failure = jasmine.createSpy('failure()');

                spyOn(request, 'post').and.returnValue((postPaymentDeferred = q.defer()).promise);

                chargePaymentPlan(event).then(success, failure);
                setTimeout(done);
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
                        amount: data.paymentPlan.price,
                        transaction: {
                            targetUsers: data.paymentPlan.viewsPerMonth,
                            cycleStart: moment(data.date).utcOffset(0).startOf('day').format(),
                            cycleEnd: moment(data.date).utcOffset(0).add(1, 'month').subtract(1, 'day').endOf('day').format(),
                            paymentPlanId: data.paymentPlan.id,
                            application: options.target
                        }
                    }
                });
            });

            describe('if the request succeeds', function() {
                let putOrgDeferred;

                beforeEach(function(done) {
                    spyOn(request, 'put').and.returnValue((putOrgDeferred = q.defer()).promise);

                    postPaymentDeferred.fulfill([request.post.calls.mostRecent().args[0].json]);
                    setTimeout(done);
                });

                it('should update the org', function() {
                    expect(request.put).toHaveBeenCalledWith({
                        url: resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint + '/' + data.org.id),
                        json: {
                            nextPaymentDate: moment(data.date).utcOffset(0).startOf('day').add(1, 'month').format()
                        }
                    });
                });

                describe('if updating the org succeeds', function() {
                    let produceDeferred;

                    beforeEach(function(done) {
                        watchmanStream.produce.and.returnValue((produceDeferred = q.defer()).promise);

                        putOrgDeferred.resolve([ld.assign({}, data.org, request.put.calls.mostRecent().args[0].json)]);
                        setTimeout(done);
                    });

                    it('should produce an event into the watchman stream', function() {
                        expect(watchmanStream.produce).toHaveBeenCalledWith({
                            type: 'chargedPaymentPlan',
                            data: {
                                org: data.org,
                                paymentPlan: data.paymentPlan,
                                payment: postPaymentDeferred.promise.inspect().value[0],
                                date: moment(data.date).format(),
                                target: 'showcase'
                            }
                        });
                    });

                    describe('if producing the event fails', function() {
                        let reason;

                        beforeEach(function(done) {
                            reason = new Error('It went wrong!');
                            produceDeferred.reject(reason);

                            setTimeout(done);
                        });

                        it('should reject the promise', function() {
                            expect(failure).toHaveBeenCalledWith(reason);
                        });
                    });

                    describe('if producing the event succeeds', function() {
                        beforeEach(function(done) {
                            produceDeferred.fulfill(watchmanStream.produce.calls.mostRecent().args[0]);
                            setTimeout(done);
                        });

                        it('should fulfill with undefined', function() {
                            expect(success).toHaveBeenCalledWith(undefined);
                        });
                    });
                });

                describe('if updating the org fails', function() {
                    let reason;

                    beforeEach(function(done) {
                        reason = new Error('It didn\'t work.');
                        putOrgDeferred.reject(reason);

                        setTimeout(done);
                    });

                    it('should log an error', function() {
                        expect(log.error).toHaveBeenCalled();
                    });

                    it('should not produce anything', function() {
                        expect(watchmanStream.produce).not.toHaveBeenCalled();
                    });

                    it('should fulfill with undefined', function() {
                        expect(success).toHaveBeenCalledWith(undefined);
                    });
                });
            });

            describe('if the request fails', function() {
                let reason;

                describe('for a random reason', function() {
                    beforeEach(function(done) {
                        reason = new SyntaxError('You suck at typing...');
                        postPaymentDeferred.reject(reason);

                        setTimeout(done);
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
                        describe(`of ${statusCode}`, function() {
                            beforeEach(function(done) {
                                reason = new Error(statusCode + ' - INTERNAL ERROR');
                                reason.name = 'StatusCodeError';
                                reason.statusCode = statusCode;

                                postPaymentDeferred.reject(reason);
                                setTimeout(done);
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
                        describe(`of ${statusCode}`, function() {
                            let produceDeferred;

                            beforeEach(function(done) {
                                reason = new Error(statusCode + ' - No dice!');
                                reason.name = 'StatusCodeError';
                                reason.statusCode = statusCode;

                                watchmanStream.produce.and.returnValue((produceDeferred = q.defer()).promise);

                                postPaymentDeferred.reject(reason);
                                setTimeout(done);
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
                                        paymentMethod: data.paymentMethod,
                                        target: 'showcase'
                                    }
                                });
                            });

                            describe('if producing the event fails', function() {
                                let reason;

                                beforeEach(function(done) {
                                    reason = new Error('It didn\'t work!');
                                    produceDeferred.reject(reason);

                                    setTimeout(done);
                                });

                                it('should reject the promise', function() {
                                    expect(failure).toHaveBeenCalledWith(reason);
                                });
                            });

                            describe('if producing the event succeeds', function() {
                                beforeEach(function(done) {
                                    produceDeferred.fulfill(watchmanStream.produce.calls.mostRecent().args[0]);
                                    setTimeout(done);
                                });

                                it('should fulfill with undefined', function() {
                                    expect(success).toHaveBeenCalledWith(undefined);
                                });
                            });
                        });
                    });
                });
            });

            describe('if there is a discount', () => {
                beforeEach(done => {
                    success.calls.reset();
                    failure.calls.reset();
                    request.post.calls.reset();
                    data.discount = 15;

                    chargePaymentPlan(event).then(success, failure);
                    setTimeout(done);
                });

                it('should subtract the discount', () => {
                    expect(request.post).toHaveBeenCalledWith({
                        url: resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint),
                        qs: {
                            org: data.org.id,
                            target: options.target
                        },
                        json: {
                            paymentMethod: data.paymentMethod.token,
                            amount: data.paymentPlan.price -  data.discount,
                            transaction: {
                                targetUsers: data.paymentPlan.viewsPerMonth,
                                cycleStart: moment(data.date).utcOffset(0).startOf('day').format(),
                                cycleEnd: moment(data.date).utcOffset(0).add(1, 'month').subtract(1, 'day').endOf('day').format(),
                                paymentPlanId: data.paymentPlan.id,
                                application: options.target
                            }
                        }
                    });
                });
            });
        });
    });
});
