'use strict';

const proxyquire = require('proxyquire').noCallThru();

describe('(action factory) activate_payment_plan', function() {
    let JsonProducer, CwrxRequest;
    let uuid, q, resolveURL, moment, ld, logger;
    let factory;

    beforeAll(function() {
        uuid = require('rc-uuid');
        q = require('q');
        resolveURL = require('url').resolve;
        moment = require('moment');
        ld = require('lodash');
        logger = require('cwrx/lib/logger');

        JsonProducer = jasmine.createSpy('JsonProducer()').and.callFake(() => ({
            produce: jasmine.createSpy('produce()').and.returnValue(q.defer().promise)
        }));
        CwrxRequest = jasmine.createSpy('CwrxRequest()').and.callFake(() => ({
            send: jasmine.createSpy('send()').and.returnValue(q.defer().promise),
            put: jasmine.createSpy('put()').and.returnValue(q.defer().promise),
            get: jasmine.createSpy('get()').and.returnValue(q.defer().promise)
        }));
        factory = proxyquire('../../src/actions/activate_payment_plan.js', {
            'rc-kinesis': {
                JsonProducer: JsonProducer
            },
            '../../lib/CwrxRequest': CwrxRequest
        });
    });

    it('should exist', function() {
        expect(factory).toEqual(jasmine.any(Function));
    });

    describe('when called', function() {
        let config;
        let activatePaymentPlan;
        let watchmanStream, request, log;

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

            log = jasmine.createSpyObj('log', ['info', 'trace', 'warn', 'error']);
            spyOn(logger, 'getLog').and.returnValue(log);

            activatePaymentPlan = factory(config);

            watchmanStream = JsonProducer.calls.mostRecent().returnValue;
            request = CwrxRequest.calls.mostRecent().returnValue;
        });

        it('should return the action', function() {
            expect(activatePaymentPlan).toEqual(jasmine.any(Function));
        });

        it('should create a JsonProducer for watchman', function() {
            expect(JsonProducer).toHaveBeenCalledWith(config.kinesis.producer.stream, config.kinesis.producer);
        });

        it('should create a CwrxRequest', function() {
            expect(CwrxRequest).toHaveBeenCalledWith(config.appCreds);
        });

        describe('the action', function() {
            let data, options, event;
            let getOrgDeferred;
            let success, failure;

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
                setTimeout(done);
            });

            it('should GET the campaign\'s org', function() {
                expect(request.get).toHaveBeenCalledWith({
                    url: resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint) + '/' + data.campaign.org
                });
            });

            describe('if the org', function() {
                let org, response;

                beforeEach(function() {
                    org = {
                        id: data.campaign.org,
                        paymentPlanId: `pp-${uuid.createUuid()}`
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
                        setTimeout(done);
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
                        setTimeout(done);
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
                    let getPromotionsDeferred;

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
                            let putOrgDeferred;

                            beforeEach(function(done) {
                                testConfig.before();

                                request.get.calls.reset();
                                request.put.and.returnValue((putOrgDeferred = q.defer()).promise);

                                getOrgDeferred.fulfill([org, response]);
                                setTimeout(done);
                            });

                            it('should not get any promotions', function() {
                                expect(request.get).not.toHaveBeenCalled();
                            });

                            it('should give the org a paymentPlanStart of today', function() {
                                expect(request.put).toHaveBeenCalledWith({
                                    url: resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint) + '/' + org.id,
                                    json: ld.merge({}, org, {
                                        paymentPlanStart: moment(data.date).utcOffset(0).startOf('day').format(),
                                        nextPaymentDate: moment(data.date).utcOffset(0).startOf('day').format()
                                    })
                                });
                            });

                            describe('when the org is updated', function() {
                                beforeEach(function(done) {
                                    putOrgDeferred.fulfill([request.put.calls.mostRecent().args[0].json, { statusCode: 200 }]);
                                    setTimeout(done);
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
                        let promotions;

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
                                    [org.paymentPlanId]: {
                                        trialLength: 14
                                    }
                                }
                            };
                            promotions[org.promotions[1].id] = {
                                id: org.promotions[1].id,
                                type: 'signupReward',
                                data: {
                                    [org.paymentPlanId]: {
                                        rewardAmount: 50,
                                        trialLength: 30
                                    }
                                }
                            };
                            promotions[org.promotions[2].id] = {
                                id: org.promotions[2].id,
                                type: 'freeTrial',
                                data: {
                                    [org.paymentPlanId]: {
                                        trialLength: 5
                                    }
                                }
                            };

                            getOrgDeferred.fulfill([org, response]);
                            setTimeout(done);
                        });

                        it('should request all of the org\'s promotions', function() {
                            expect(request.get).toHaveBeenCalledWith({
                                url: resolveURL(config.cwrx.api.root, config.cwrx.api.promotions.endpoint),
                                qs: { ids: org.promotions.map(function(promotion) { return promotion.id; }).join(',') }
                            });
                        });

                        describe('if the promotions cannot be fetched', function() {
                            let reason;

                            beforeEach(function(done) {
                                reason = new Error('It went wrong.');

                                getPromotionsDeferred.reject(reason);
                                setTimeout(done);
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
                            let putOrgDeferred;

                            beforeEach(function(done) {
                                request.put.and.returnValue((putOrgDeferred = q.defer()).promise);

                                getPromotionsDeferred.fulfill([
                                    Object.keys(promotions).map(function(id) {
                                        return promotions[id];
                                    }),
                                    { statusCode: 200 }
                                ]);
                                setTimeout(done);
                            });

                            it('should give the org a paymentPlanStart computed from the length of its freeTrial promotions', function() {
                                expect(request.put).toHaveBeenCalledWith({
                                    url: resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint) + '/' + org.id,
                                    json: ld.merge({}, org, {
                                        paymentPlanStart: moment(data.date).utcOffset(0).startOf('day').add(19, 'days').format(),
                                        nextPaymentDate: moment(data.date).utcOffset(0).startOf('day').add(19, 'days').format()
                                    })
                                });
                            });

                            describe('when the org is updated', function() {
                                let getDeferred;

                                beforeEach(function(done) {
                                    request.get.calls.reset();
                                    request.get.and.returnValue((getDeferred = q.defer()).promise);

                                    putOrgDeferred.fulfill([request.put.calls.mostRecent().args[0].json, { statusCode: 200 }]);
                                    setTimeout(done);
                                });

                                it('should get the org\'s payment plan', function() {
                                    expect(request.get).toHaveBeenCalledWith({
                                        url: `${resolveURL(config.cwrx.api.root, config.cwrx.api.paymentPlans.endpoint)}/${org.paymentPlanId}`
                                    });
                                });

                                describe('when the paymentPlan is fetched', function() {
                                    let produceDeferred;
                                    let paymentPlan;

                                    beforeEach(function(done) {
                                        watchmanStream.produce.and.returnValue((produceDeferred = q.defer()).promise);

                                        paymentPlan = {
                                            label: 'Starter',
                                            price: 49.99,
                                            maxCampaigns: 1,
                                            viewsPerMonth: 2000,
                                            id: org.paymentPlanId,
                                            created: '2016-07-05T14:18:29.642Z',
                                            lastUpdated: '2016-07-05T14:28:57.336Z',
                                            status: 'active'
                                        };

                                        getDeferred.resolve([paymentPlan, { statusCode: 200 }]);
                                        setTimeout(done);
                                    });

                                    it('should produce a record into the watchman stream', function() {
                                        expect(watchmanStream.produce).toHaveBeenCalledWith({
                                            type: 'promotionFulfilled',
                                            data: {
                                                org: org,
                                                promotion: promotions[Object.keys(promotions)[0]],
                                                paymentPlan: paymentPlan,
                                                target: options.target,
                                                date: data.date
                                            }
                                        });
                                        expect(watchmanStream.produce).toHaveBeenCalledWith({
                                            type: 'promotionFulfilled',
                                            data: {
                                                org: org,
                                                promotion: promotions[Object.keys(promotions)[2]],
                                                paymentPlan: paymentPlan,
                                                target: options.target,
                                                date: data.date
                                            }
                                        });
                                        expect(watchmanStream.produce.calls.count()).toBe(2, 'Incorrect number of events produced.');
                                    });

                                    describe('if producing the record succeeds', function() {
                                        beforeEach(function(done) {
                                            produceDeferred.fulfill({
                                                type: 'promotionFulfilled'
                                            });
                                            setTimeout(done);
                                        });

                                        it('should fulfill with undefined', function() {
                                            expect(success).toHaveBeenCalledWith(undefined);
                                        });
                                    });

                                    describe('if producing the record fails', function() {
                                        let reason;

                                        beforeEach(function(done) {
                                            reason = new Error('Something went wrong!');

                                            produceDeferred.reject(reason);
                                            setTimeout(done);
                                        });

                                        it('should fulfill with undefined', function() {
                                            expect(success).toHaveBeenCalledWith(undefined);
                                        });

                                        it('should log an error', function() {
                                            expect(log.error).toHaveBeenCalled();
                                        });
                                    });
                                });
                            });

                            describe('if the org cannot be updated', function() {
                                let reason;

                                beforeEach(function(done) {
                                    reason = new Error('It failed!');

                                    putOrgDeferred.reject(reason);
                                    setTimeout(done);
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
