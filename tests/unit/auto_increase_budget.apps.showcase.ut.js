'use strict';

const Status = require('cwrx/lib/enums').Status;
const moment = require('moment');
const proxyquire = require('proxyquire');

describe('(action factory) showcase/apps/auto_increase_budget', function() {
    var q, uuid, resolveURL, ld, logger;
    var JsonProducer, CwrxRequest, BeeswaxClient;
    var factory;

    beforeAll(function() {
        q = require('q');
        uuid = require('rc-uuid');
        resolveURL = require('url').resolve;
        ld = require('lodash');
        logger = require('cwrx/lib/logger');
    });

    beforeEach(function() {
        JsonProducer = (function(JsonProducer) {
            return jasmine.createSpy('JsonProducer()').and.callFake(function(name, options) {
                const producer = new JsonProducer(name, options);

                spyOn(producer, 'produce').and.returnValue(q.defer().promise);

                return producer;
            });
        }(require('rc-kinesis').JsonProducer));

        CwrxRequest = (function(CwrxRequest) {
            return jasmine.createSpy('CwrxRequest()').and.callFake(function(creds) {
                const request = new CwrxRequest(creds);

                spyOn(request, 'send').and.returnValue(q.defer().promise);

                return request;
            });
        }(require('../../lib/CwrxRequest')));

        BeeswaxClient = (BeeswaxClient => jasmine.createSpy('BeeswaxClient()').and.callFake(config => new BeeswaxClient(config)))(require('beeswax-client'));

        factory = proxyquire('../../src/actions/showcase/apps/auto_increase_budget', {
            'rc-kinesis': {
                JsonProducer
            },
            '../../../../lib/CwrxRequest': CwrxRequest,
            'beeswax-client': BeeswaxClient
        });
    });

    it('should exist', function() {
        expect(factory).toEqual(jasmine.any(Function));
    });

    describe('when called', function() {
        var config, paymentPlan;
        var autoIncreaseBudget;
        var request, beeswax, log;

        beforeEach(function() {
            paymentPlan = {
                id: 'pp-' + uuid.createUuid(),
                price: 49.99,
                impressionsPerDollar: 50,
                dailyImpressionLimit: 100
            };
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
                },
                paymentPlans: {
                    [paymentPlan.id]: paymentPlan
                },
                state: {
                    secrets: {
                        beeswax: {
                            email: 'ops@reelcontent.com',
                            password: 'wueyrfhu83rgf4u3gr'
                        }
                    }
                },
                beeswax: {
                    apiRoot: 'https://stingersbx.api.beeswax.com'
                },
                campaign: {
                    conversionMultipliers: {
                        internal: 1.1,
                        external: 1.25
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
            beeswax = BeeswaxClient.calls.mostRecent().returnValue;
        });

        it('should return the action Function', function() {
            expect(autoIncreaseBudget).toEqual(jasmine.any(Function));
        });

        it('should create a CwrxRequest', function() {
            expect(CwrxRequest).toHaveBeenCalledWith(config.appCreds);
        });

        it('should create a BeeswaxClient', function() {
            expect(BeeswaxClient).toHaveBeenCalledWith({
                apiRoot: config.beeswax.apiRoot,
                creds: config.state.secrets.beeswax
            });
        });

        describe('the action', function() {
            var data, options, event;
            var getCampaignsDeferred;
            let findBeeswaxCampaignDeferreds;
            let editBeeswaxCampaignDeferreds;
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
                        application: 'showcase',
                        paymentPlanId: paymentPlan.id,
                        targetUsers: 2000,
                        cycleStart: moment().format(),
                        cycleEnd: moment().add(1, 'month').subtract(1, 'day').format(),
                        description: JSON.stringify({ eventType: 'credit', source: 'braintree' })
                    }
                };
                options = {
                    dailyLimit: 3,
                    externalAllocationFactor: 0.5
                };
                event = { data: data, options: options };

                success = jasmine.createSpy('success()');
                failure = jasmine.createSpy('failure()');

                spyOn(request, 'get').and.returnValue((getCampaignsDeferred = q.defer()).promise);

                findBeeswaxCampaignDeferreds = [];
                spyOn(beeswax.campaigns, 'find').and.callFake(() => {
                    return findBeeswaxCampaignDeferreds[findBeeswaxCampaignDeferreds.push(q.defer()) - 1].promise;
                });

                editBeeswaxCampaignDeferreds = [];
                spyOn(beeswax.campaigns, 'edit').and.callFake(() => {
                    return editBeeswaxCampaignDeferreds[editBeeswaxCampaignDeferreds.push(q.defer()) - 1].promise;
                });

                autoIncreaseBudget(event).then(success, failure);
                setTimeout(done);
            });

            it('should get all of the org\'s campaigns', function() {
                expect(request.get).toHaveBeenCalledWith({
                    url: resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint),
                    qs: {
                        org: data.transaction.org,
                        application: 'showcase',
                        status: [
                            Status.Draft, Status.New, Status.Pending, Status.Approved, Status.Rejected, Status.Active, Status.Paused,
                            Status.Inactive, Status.Expired, Status.OutOfBudget, Status.Error
                        ].join(',')
                    }
                });
            });

            describe('when the campaigns are fetched', function() {
                var campaigns;
                var putCampaignDeferreds, putExternalCampaignDeferreds;

                beforeEach(function(done) {
                    campaigns = [
                        {
                            id: 'cam-' + uuid.createUuid(),
                            status: 'outOfBudget',
                            application: 'showcase',
                            pricing: {
                                model: 'cpv',
                                cost: 0.01,
                                budget: 0,
                                dailyLimit: 2
                            },
                            externalCampaigns: {
                                beeswax: {
                                    externalId: uuid.createUuid(),
                                    budget: 0,
                                    dailyLimit: 1
                                }
                            },
                            product: {
                                type: 'ecommerce'
                            }
                        },
                        {
                            id: 'cam-' + uuid.createUuid(),
                            status: 'active',
                            application: 'showcase',
                            pricing: {
                                model: 'cpv',
                                cost: 0.01,
                                budget: 26,
                                dailyLimit: 2
                            },
                            externalCampaigns: {
                                beeswax: {
                                    externalId: uuid.createUuid(),
                                    budgetImpressions: 1000,
                                    dailyLimitImpressions: 300
                                }
                            },
                            conversionMultipliers: {
                                internal: 1.25,
                                external: 1.50
                            },
                            product: {
                                type: 'app'
                            },
                            targetUsers: 800
                        },
                        {
                            id: 'cam-' + uuid.createUuid(),
                            status: 'outOfBudget',
                            application: 'showcase',
                            externalIds: {
                                beeswax: uuid.createUuid()
                            },
                            product: {
                                type: 'app'
                            },
                            targetUsers: 1200
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
                            },
                            externalCampaigns: {
                                beeswax: {
                                    externalId: uuid.createUuid(),
                                    budgetImpressions: 0,
                                    dailyLimitImpressions: 200
                                }
                            },
                            product: {
                                type: 'ecommerce'
                            }
                        }
                    ];

                    putExternalCampaignDeferreds = {};
                    putCampaignDeferreds = {};
                    spyOn(request, 'put').and.callFake(function(config) {
                        var id = config.url.match(/cam-[^\/]+/)[0];

                        if (/beeswax$/.test(config.url)) {
                            return (putExternalCampaignDeferreds[id] = q.defer()).promise;
                        } else {
                            return (putCampaignDeferreds[id] = q.defer()).promise;
                        }
                    });

                    getCampaignsDeferred.fulfill([campaigns, { statusCode: 200 }]);
                    setTimeout(done);
                });

                it('should update the bob campaign pricing', function() {
                    expect(request.put.calls.count()).toBe(2);
                    expect(request.put).toHaveBeenCalledWith({
                        url: resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint + '/' + campaigns[1].id),
                        json: ld.assign({}, campaigns[1], {
                            status: 'active',
                            pricing: ld.assign({}, campaigns[1].pricing, {
                                model: 'cpv',
                                cost: 0.020,
                                budget: 51,
                                dailyLimit: options.dailyLimit
                            })
                        })
                    });
                    expect(request.put).toHaveBeenCalledWith({
                        url: resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint + '/' + campaigns[2].id),
                        json: ld.assign({}, campaigns[2], {
                            status: 'active',
                            pricing: {
                                model: 'cpv',
                                cost: 0.023,
                                budget: 25,
                                dailyLimit: options.dailyLimit
                            }
                        })
                    });
                });

                it('should find the beeswax campaigns', function() {
                    expect(beeswax.campaigns.find.calls.count()).toBe(2);

                    expect(beeswax.campaigns.find).toHaveBeenCalledWith(campaigns[1].externalCampaigns.beeswax.externalId);
                    expect(beeswax.campaigns.find).toHaveBeenCalledWith(campaigns[2].externalIds.beeswax);
                });

                describe('when the campaigns have been updated and the beeswax campaigns have been fetched', function() {
                    let beeswaxCampaigns;

                    beforeEach(function(done) {
                        putCampaignDeferreds[campaigns[1].id].fulfill([request.put.calls.all()[0].args[0].json, { statusCode: 200 }]);
                        putCampaignDeferreds[campaigns[2].id].fulfill([request.put.calls.all()[1].args[0].json, { statusCode: 200 }]);

                        beeswaxCampaigns = [
                            {
                                campaign_id: campaigns[1].externalCampaigns.beeswax.externalId,
                                campaign_budget: 1000
                            },
                            {
                                campaign_id: campaigns[2].externalIds.beeswax,
                                campaign_budget: 0
                            }
                        ];

                        findBeeswaxCampaignDeferreds.forEach((deferred, index) => deferred.resolve({
                            success: true,
                            payload: beeswaxCampaigns[index]
                        }));

                        setTimeout(done);
                    });

                    it('should update the beeswax campaigns', function() {
                        expect(beeswax.campaigns.edit.calls.count()).toBe(2);

                        expect(beeswax.campaigns.edit).toHaveBeenCalledWith(beeswaxCampaigns[0].campaign_id, {
                            campaign_budget: 2500
                        });
                        expect(beeswax.campaigns.edit).toHaveBeenCalledWith(beeswaxCampaigns[1].campaign_id, {
                            campaign_budget: 1250
                        });
                    });

                    describe('when the beeswax campaigns have been updated', function() {
                        beforeEach(function(done) {
                            editBeeswaxCampaignDeferreds.forEach((deferred, index) => deferred.resolve({
                                success: true,
                                payload: ld.assign({}, beeswaxCampaigns[index], beeswax.campaigns.edit.calls.all()[index].args[1])
                            }));

                            setTimeout(done);
                        });

                        it('should not log an error', function() {
                            expect(log.error).not.toHaveBeenCalled();
                        });

                        it('should fulfill with undefined', function() {
                            expect(success).toHaveBeenCalledWith(undefined);
                        });
                    });

                    describe('if an external campaign fails to udpate', function() {
                        beforeEach(function(done) {
                            editBeeswaxCampaignDeferreds[0].reject(new Error('Everything dies eventually.'));

                            setTimeout(done);
                        });

                        it('should log an error', function() {
                            expect(log.error).toHaveBeenCalled();
                        });

                        it('should fulfill with undefined', function() {
                            expect(success).toHaveBeenCalledWith(undefined);
                        });
                    });
                });

                describe('if a campaign fails to update', function() {
                    beforeEach(function(done) {
                        putCampaignDeferreds[campaigns[1].id].reject(new Error('There was a problem doing stuff!'));
                        putCampaignDeferreds[campaigns[2].id].reject(new Error('There was a problem doing more stuff!'));

                        setTimeout(done);
                    });

                    it('should log an error', function() {
                        expect(log.error).toHaveBeenCalled();
                    });

                    it('should fulfill with undefined', function() {
                        expect(success).toHaveBeenCalledWith(undefined);
                    });
                });
            });

            describe('if the transaction has no paymentPlanId', function() {
                beforeEach(function(done) {
                    success.calls.reset();
                    failure.calls.reset();

                    delete data.transaction.paymentPlanId;

                    request.get.calls.reset();

                    autoIncreaseBudget(event).then(success, failure);
                    setTimeout(done);
                });

                it('should log an error', function() {
                    expect(log.error).toHaveBeenCalled();
                });

                it('should fulfill with undefined', function() {
                    expect(success).toHaveBeenCalledWith(undefined);
                });

                it('should not GET anything', function() {
                    expect(request.get).not.toHaveBeenCalled();
                });
            });

            describe('if the transaction paymentPlanId is unknown', function() {
                beforeEach(function(done) {
                    success.calls.reset();
                    failure.calls.reset();

                    data.transaction.paymentPlanId = `pp-${uuid.createUuid()}`;

                    request.get.calls.reset();

                    autoIncreaseBudget(event).then(success, failure);
                    setTimeout(done);
                });

                it('should log an error', function() {
                    expect(log.error).toHaveBeenCalled();
                });

                it('should fulfill with undefined', function() {
                    expect(success).toHaveBeenCalledWith(undefined);
                });

                it('should not GET anything', function() {
                    expect(request.get).not.toHaveBeenCalled();
                });
            });
        });
    });
});
