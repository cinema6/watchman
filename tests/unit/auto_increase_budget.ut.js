'use strict';

describe('(action factory) auto_increase_budget', function() {
    var q, uuid, resolveURL, ld, logger;
    var JsonProducer, CwrxRequest;
    var factory;

    beforeAll(function() {
        q = require('q');
        uuid = require('rc-uuid');
        resolveURL = require('url').resolve;
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

                return request;
            });
        }(require('../../lib/CwrxRequest')));
        require.cache[require.resolve('../../lib/CwrxRequest')].exports = CwrxRequest;

        delete require.cache[require.resolve('../../src/actions/auto_increase_budget')];
        factory = require('../../src/actions/auto_increase_budget');
    });

    beforeEach(function() {
        [JsonProducer, CwrxRequest].forEach(function(spy) {
            spy.calls.reset();
        });
    });

    it('should exist', function() {
        expect(factory).toEqual(jasmine.any(Function));
        expect(factory.name).toBe('autoIncreaseBudgetFactory');
    });

    describe('when called', function() {
        var config;
        var autoIncreaseBudget;
        var request, log;

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
                        campaigns: {
                            endpoint: '/api/campaigns'
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

            autoIncreaseBudget = factory(config);

            request = CwrxRequest.calls.mostRecent().returnValue;
        });

        it('should return the action Function', function() {
            expect(autoIncreaseBudget).toEqual(jasmine.any(Function));
            expect(autoIncreaseBudget.name).toBe('autoIncreaseBudget');
        });

        it('should create a CwrxRequest', function() {
            expect(CwrxRequest).toHaveBeenCalledWith(config.appCreds);
        });

        describe('the action', function() {
            var data, options, event;
            var getCampaignsDeferred;
            var success, failure;

            beforeEach(function(done) {
                data = {
                    transaction: {
                        id: 't-' + uuid.createUuid(),
                        created: new Date().toISOString(),
                        transactionTS: new Date().toISOString(),
                        amount: 50,
                        sign: 1,
                        units: 1,
                        org: 'o-' + uuid.createUuid(),
                        campaign: null,
                        braintreeId: null,
                        promotion: 'pro-' + uuid.createUuid(),
                        description: null
                    }
                };
                options = {

                };
                event = { data: data, options: options };

                success = jasmine.createSpy('success()');
                failure = jasmine.createSpy('failure()');

                spyOn(request, 'get').and.returnValue((getCampaignsDeferred = q.defer()).promise);

                autoIncreaseBudget(event).then(success, failure);
                process.nextTick(done);
            });

            it('should get all of the org\'s campaigns', function() {
                expect(request.get).toHaveBeenCalledWith({
                    url: resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint),
                    qs: { org: data.transaction.org }
                });
            });

            describe('when the campaigns are fetched', function() {
                var campaigns;
                var putCampaignDeferreds;

                beforeEach(function(done) {
                    campaigns = [
                        {
                            id: 'cam-' + uuid.createUuid(),
                            status: 'active',
                            application: 'selfie',
                            pricing: {
                                model: 'cpv',
                                cost: 0.06,
                                budget: 250,
                                dailyLimit: 50
                            }
                        },
                        {
                            id: 'cam-' + uuid.createUuid(),
                            status: 'active',
                            application: 'showcase',
                            pricing: {
                                model: 'cpv',
                                cost: 0.01,
                                budget: 1,
                                dailyLimit: 2
                            }
                        },
                        {
                            id: 'cam-' + uuid.createUuid(),
                            status: 'outOfBudget',
                            application: 'showcase',
                            pricing: {
                                model: 'cpv',
                                cost: 0.01,
                                budget: 0,
                                dailyLimit: 2
                            }
                        },
                        {
                            id: 'cam-' + uuid.createUuid(),
                            status: 'paused',
                            application: 'selfie',
                            pricing: {
                                model: 'cpv',
                                cost: 0.06,
                                budget: 250,
                                dailyLimit: 50
                            }
                        }
                    ];

                    putCampaignDeferreds = {};
                    spyOn(request, 'put').and.callFake(function(config) {
                        return (putCampaignDeferreds[config.json.id] = q.defer()).promise;
                    });

                    getCampaignsDeferred.fulfill([campaigns, { statusCode: 200 }]);
                    process.nextTick(done);
                });

                it('should update the bob campaign budgets', function() {
                    expect(request.put.calls.count()).toBe(2);
                    expect(request.put).toHaveBeenCalledWith({
                        url: resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint + '/' + campaigns[1].id),
                        json: ld.assign({}, campaigns[1], {
                            status: 'active',
                            pricing: ld.assign({}, campaigns[1].pricing, {
                                budget: campaigns[1].pricing.budget + (data.transaction.amount / campaigns.length)
                            })
                        })
                    });
                    expect(request.put).toHaveBeenCalledWith({
                        url: resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint + '/' + campaigns[2].id),
                        json: ld.assign({}, campaigns[2], {
                            status: 'active',
                            pricing: ld.assign({}, campaigns[2].pricing, {
                                budget: campaigns[2].pricing.budget + (data.transaction.amount / campaigns.length)
                            })
                        })
                    });
                });

                describe('when the campaigns have been updated', function() {
                    beforeEach(function(done) {
                        putCampaignDeferreds[campaigns[1].id].fulfill([request.put.calls.all()[0].args[0].json, { statusCode: 200 }]);
                        putCampaignDeferreds[campaigns[2].id].fulfill([request.put.calls.all()[1].args[0].json, { statusCode: 200 }]);

                        process.nextTick(done);
                    });

                    it('should fulfill with undefined', function() {
                        expect(success).toHaveBeenCalledWith(undefined);
                    });
                });

                describe('if a campaign fails to update', function() {
                    beforeEach(function(done) {
                        putCampaignDeferreds[campaigns[1].id].fulfill([request.put.calls.all()[0].args[0].json, { statusCode: 200 }]);
                        putCampaignDeferreds[campaigns[2].id].reject(new Error('There was a problem doing stuff!'));

                        process.nextTick(done);
                    });

                    it('should log an error', function() {
                        expect(log.error).toHaveBeenCalled();
                    });

                    it('should fulfill with undefined', function() {
                        expect(success).toHaveBeenCalledWith(undefined);
                    });
                });
            });
        });
    });
});
