'use strict';

describe('(action factory) activate_payment_plan', function() {
    var JsonProducer, CwrxRequest;
    var uuid, q, resolveURL, moment, ld, logger;
    var factory;

    beforeAll(function() {
        uuid = require('rc-uuid');
        q = require('q');
        resolveURL = require('url').resolve;
        moment = require('moment');
        ld = require('lodash');
        logger = require('cwrx/lib/logger');

        delete require.cache[require.resolve('rc-kinesis')];
        JsonProducer = (function(JsonProducer) {
            return jasmine.createSpy('JsonProducer()').and.callFake(function(name, options) {
                var producer = new JsonProducer(name, options);

                spyOn(producer, 'produce').and.returnValue(q.defer().promise);

                return producer;
            });
        }(require('rc-kinesis').JsonProducer));
        require.cache[require.resolve('rc-kinesis')].exports.JsonProducer = JsonProducer;

        delete require.cache[require.resolve('../../lib/CwrxRequest')];
        CwrxRequest = (function(CwrxRequest) {
            return jasmine.createSpy('CwrxRequest()').and.callFake(function(creds) {
                var request = new CwrxRequest(creds);

                spyOn(request, 'send').and.returnValue(q.defer().promise);
                spyOn(request, 'put').and.returnValue(q.defer().promise);
                spyOn(request, 'get').and.returnValue(q.defer().promise);

                return request;
            });
        }(require('../../lib/CwrxRequest')));
        require.cache[require.resolve('../../lib/CwrxRequest')].exports = CwrxRequest;

        factory = require('../../src/actions/activate_payment_plan');
    });

    it('should exist', function() {
        expect(factory).toEqual(jasmine.any(Function));
        expect(factory.name).toEqual('activatePaymentPlanFactory');
    });

    describe('when called', function() {
        var config;
        var activatePaymentPlan;
        var watchmanStream, request, log;

        beforeEach(function() {
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
                        },
                        promotions: {
                            endpoint: '/api/promotions'
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

            log = jasmine.createSpyObj('log', ['info', 'trace', 'warn', 'error']);
            spyOn(logger, 'getLog').and.returnValue(log);

            activatePaymentPlan = factory(config);

            watchmanStream = JsonProducer.calls.mostRecent().returnValue;
            request = CwrxRequest.calls.mostRecent().returnValue;

            jasmine.clock().install();
            jasmine.clock().mockDate();
        });

        afterEach(function() {
            jasmine.clock().uninstall();
        });

        it('should return the action', function() {
            expect(activatePaymentPlan).toEqual(jasmine.any(Function));
            expect(activatePaymentPlan.name).toBe('activatePaymentPlan');
        });

        it('should create a JsonProducer for watchman', function() {
            expect(JsonProducer).toHaveBeenCalledWith(config.kinesis.producer.stream, config.kinesis.producer);
        });

        it('should create a CwrxRequest', function() {
            expect(CwrxRequest).toHaveBeenCalledWith(config.appCreds);
        });

        describe('the action', function() {
            var data, options, event;
            var getOrgDeferred;
            var success, failure;

            beforeEach(function(done) {
                data = {
                    campaign: {
                        id: 'cam-' + uuid.createUuid(),
                        org: 'o-' + uuid.createUuid()
                    },
                    date: moment().subtract(1, 'month').format()
                };
                options = {
                    target: 'showcase'
                };
                event = { data: data, options: options };

                success = jasmine.createSpy('success()');
                failure = jasmine.createSpy('failure()');

                request.get.and.returnValue((getOrgDeferred = q.defer()).promise);

                activatePaymentPlan(event).then(success, failure);
                process.nextTick(done);
            });

            it('should GET the campaign\'s org', function() {
                expect(request.get).toHaveBeenCalledWith({
                    url: resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint) + '/' + data.campaign.org
                });
            });

            describe('if the org', function() {
                var org, response;

                beforeEach(function() {
                    org = {
                        id: data.campaign.org,
                        paymentPlanId: Object.keys(config.paymentPlans)[0]
                    };
                    response = {
                        statusCode: 200
                    };
                });

                describe('has no paymentPlanId', function() {
                    beforeEach(function(done) {
                        delete org.paymentPlanStart;
                        delete org.paymentPlanId;

                        request.get.calls.reset();

                        getOrgDeferred.fulfill([org, response]);
                        process.nextTick(done);
                    });

                    it('should fulfill with undefined', function() {
                        expect(success).toHaveBeenCalledWith(undefined);
                    });

                    it('should not get anything else', function() {
                        expect(request.get).not.toHaveBeenCalled();
                    });

                    it('should not put anything', function() {
                        expect(request.put).not.toHaveBeenCalled();
                    });

                    it('should not produce any events', function() {
                        expect(watchmanStream.produce).not.toHaveBeenCalled();
                    });
                });

                describe('has a paymentPlanStart date', function() {
                    beforeEach(function(done) {
                        org.paymentPlanStart = new Date().toISOString();

                        request.get.calls.reset();

                        getOrgDeferred.fulfill([org, response]);
                        process.nextTick(done);
                    });

                    it('should fulfill with undefined', function() {
                        expect(success).toHaveBeenCalledWith(undefined);
                    });

                    it('should not get anything else', function() {
                        expect(request.get).not.toHaveBeenCalled();
                    });

                    it('should not put anything', function() {
                        expect(request.put).not.toHaveBeenCalled();
                    });

                    it('should not produce any events', function() {
                        expect(watchmanStream.produce).not.toHaveBeenCalled();
                    });
                });

                describe('does not have a paymentPlanStart date', function() {
                    var getPromotionsDeferred;

                    beforeEach(function() {
                        delete org.paymentPlanStart;

                        request.get.calls.reset();
                        request.get.and.returnValue((getPromotionsDeferred = q.defer()).promise);
                    });

                    [
                        {
                            description: 'and has no promotions',
                            before: function() {
                                delete org.promotions;
                            }
                        },
                        {
                            description: 'and has an empty promotions array',
                            before: function() {
                                org.promotions = [];
                            }
                        }
                    ].forEach(function(testConfig) {
                        describe(testConfig.description, function() {
                            var putOrgDeferred;

                            beforeEach(function(done) {
                                testConfig.before();

                                request.get.calls.reset();
                                request.put.and.returnValue((putOrgDeferred = q.defer()).promise);

                                getOrgDeferred.fulfill([org, response]);
                                process.nextTick(done);
                            });

                            it('should not get any promotions', function() {
                                expect(request.get).not.toHaveBeenCalled();
                            });

                            it('should give the org a paymentPlanStart of today', function() {
                                expect(request.put).toHaveBeenCalledWith({
                                    url: resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint) + '/' + org.id,
                                    json: ld.merge({}, org, {
                                        paymentPlanStart: moment(data.date).format(),
                                        nextPaymentDate: moment(data.date).format()
                                    })
                                });
                            });

                            describe('when the org is updated', function() {
                                beforeEach(function(done) {
                                    putOrgDeferred.fulfill([request.put.calls.mostRecent().args[0].json, { statusCode: 200 }]);
                                    process.nextTick(done);
                                });

                                it('should not produce an event', function() {
                                    expect(watchmanStream.produce).not.toHaveBeenCalled();
                                });

                                it('should fulfill with undefined', function() {
                                    expect(success).toHaveBeenCalledWith(undefined);
                                });
                            });
                        });
                    });

                    describe('and has promotions', function() {
                        var promotions;

                        beforeEach(function(done) {
                            org.promotions = Array.apply([], new Array(3)).map(function() {
                                return {
                                    id: 'pro-' + uuid.createUuid(),
                                    created: new Date().toISOString(),
                                    lastUpdated: new Date().toISOString(),
                                    status: 'active'
                                };
                            });

                            promotions = {};
                            promotions[org.promotions[0].id] = {
                                id: org.promotions[0].id,
                                type: 'freeTrial',
                                data: {
                                    trialLength: 14
                                }
                            };
                            promotions[org.promotions[1].id] = {
                                id: org.promotions[1].id,
                                type: 'signupReward',
                                data: {
                                    rewardAmount: 50,
                                    trialLength: 30
                                }
                            };
                            promotions[org.promotions[2].id] = {
                                id: org.promotions[2].id,
                                type: 'freeTrial',
                                data: {
                                    trialLength: 5
                                }
                            };

                            getOrgDeferred.fulfill([org, response]);
                            process.nextTick(done);
                        });

                        it('should request all of the org\'s promotions', function() {
                            expect(request.get).toHaveBeenCalledWith({
                                url: resolveURL(config.cwrx.api.root, config.cwrx.api.promotions.endpoint),
                                qs: { ids: org.promotions.map(function(promotion) { return promotion.id; }).join(',') }
                            });
                        });

                        describe('if the promotions cannot be fetched', function() {
                            var reason;

                            beforeEach(function(done) {
                                reason = new Error('It went wrong.');

                                getPromotionsDeferred.reject(reason);
                                process.nextTick(done);
                            });

                            it('should reject the promise', function() {
                                expect(failure).toHaveBeenCalledWith(reason);
                            });

                            it('should not give the org a paymentPlanStart', function() {
                                expect(request.put).not.toHaveBeenCalled();
                            });

                            it('should not produce any events', function() {
                                expect(watchmanStream.produce).not.toHaveBeenCalled();
                            });
                        });

                        describe('when the promotions are fetched', function() {
                            var putOrgDeferred;

                            beforeEach(function(done) {
                                request.put.and.returnValue((putOrgDeferred = q.defer()).promise);

                                getPromotionsDeferred.fulfill([
                                    Object.keys(promotions).map(function(id) {
                                        return promotions[id];
                                    }),
                                    { statusCode: 200 }
                                ]);
                                process.nextTick(done);
                            });

                            it('should give the org a paymentPlanStart computed from the length of its freeTrial promotions', function() {
                                expect(request.put).toHaveBeenCalledWith({
                                    url: resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint) + '/' + org.id,
                                    json: ld.merge({}, org, {
                                        paymentPlanStart: moment(data.date).add(19, 'days').format(),
                                        nextPaymentDate: moment(data.date).add(19, 'days').format()
                                    })
                                });
                            });

                            describe('when the org is updated', function() {
                                var produceDeferred;

                                beforeEach(function(done) {
                                    watchmanStream.produce.and.returnValue((produceDeferred = q.defer()).promise);

                                    putOrgDeferred.fulfill([request.put.calls.mostRecent().args[0].json, { statusCode: 200 }]);
                                    process.nextTick(done);
                                });

                                it('should produce a record into the watchman stream', function() {
                                    expect(watchmanStream.produce).toHaveBeenCalledWith({
                                        type: 'promotionFulfilled',
                                        data: {
                                            org: org,
                                            promotion: promotions[Object.keys(promotions)[0]],
                                            paymentPlan: config.paymentPlans[org.paymentPlanId],
                                            target: options.target
                                        }
                                    });
                                    expect(watchmanStream.produce).toHaveBeenCalledWith({
                                        type: 'promotionFulfilled',
                                        data: {
                                            org: org,
                                            promotion: promotions[Object.keys(promotions)[2]],
                                            paymentPlan: config.paymentPlans[org.paymentPlanId],
                                            target: options.target
                                        }
                                    });
                                    expect(watchmanStream.produce.calls.count()).toBe(2, 'Incorrect number of events produced.');
                                });

                                describe('if producing the record succeeds', function() {
                                    beforeEach(function(done) {
                                        produceDeferred.fulfill({
                                            type: 'promotionFulfilled'
                                        });
                                        process.nextTick(done);
                                    });

                                    it('should fulfill with undefined', function() {
                                        expect(success).toHaveBeenCalledWith(undefined);
                                    });
                                });

                                describe('if producing the record fails', function() {
                                    var reason;

                                    beforeEach(function(done) {
                                        reason = new Error('Something went wrong!');

                                        produceDeferred.reject(reason);
                                        process.nextTick(done);
                                    });

                                    it('should fulfill with undefined', function() {
                                        expect(success).toHaveBeenCalledWith(undefined);
                                    });

                                    it('should log an error', function() {
                                        expect(log.error).toHaveBeenCalled();
                                    });
                                });
                            });

                            describe('if the org cannot be updated', function() {
                                var reason;

                                beforeEach(function(done) {
                                    reason = new Error('It failed!');

                                    putOrgDeferred.reject(reason);
                                    process.nextTick(done);
                                });

                                it('should reject the promise', function() {
                                    expect(failure).toHaveBeenCalledWith(reason);
                                });

                                it('should not produce anything', function() {
                                    expect(watchmanStream.produce).not.toHaveBeenCalled();
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
