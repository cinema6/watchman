'use strict';

const proxyquire = require('proxyquire');
const createUuid = require('rc-uuid').createUuid;
const q = require('q');
const resolveURL = require('url').resolve;
const _ = require('lodash');
const moment = require('moment');
const Status = require('cwrx/lib/enums').Status;
const logger = require('cwrx/lib/logger');

describe('showcase lib', function() {
    let CwrxRequest, BeeswaxClient;
    let config;
    let showcase;
    let request, beeswax;

    beforeEach(function() {
        CwrxRequest = (function(CwrxRequest) {
            return jasmine.createSpy('CwrxRequest()').and.callFake(function(creds) {
                let request = new CwrxRequest(creds);

                spyOn(request, 'send').and.returnValue(q.defer().promise);

                return request;
            });
        }(require('../../lib/CwrxRequest')));
        BeeswaxClient = (BeeswaxClient => jasmine.createSpy('BeeswaxClient()').and.callFake(config => new BeeswaxClient(config)))(require('beeswax-client'));

        config = {
            appCreds: {
                key: 'watchman-dev',
                secret: 'dwei9fhj3489ghr7834909r'
            },
            cwrx: {
                api: {
                    root: 'http://33.33.33.10/',
                    campaigns: {
                        endpoint: '/api/campaigns'
                    },
                    transactions: {
                        endpoint: '/api/transactions'
                    },
                    analytics: {
                        endpoint: '/api/analytics'
                    }
                }
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

        spyOn(logger, 'getLog').and.returnValue(jasmine.createSpyObj('log', [
            'info',
            'trace',
            'warn',
            'error'
        ]));

        showcase = proxyquire('../../lib/showcase', {
            './CwrxRequest': CwrxRequest,
            'beeswax-client': BeeswaxClient
        })(config);

        request = CwrxRequest.calls.mostRecent().returnValue;
        beeswax = BeeswaxClient.calls.mostRecent().returnValue;
    });

    it('should exist', function() {
        expect(showcase).toEqual(jasmine.any(Object));
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

    describe('rebalance(orgId)', function() {
        let orgId;
        let success, failure;
        let getCampaignsDeferred, getTransactionsDeferred, getAnalyticsDeferreds, putExternalCampaignDeferreds;
        let putCampaignDeferreds;
        let getBeeswaxCampaignDeferreds;
        let editBeeswaxCampaignDeferreds;

        beforeEach(function(done) {
            orgId = `o-${createUuid()}`;

            success = jasmine.createSpy('success()');
            failure = jasmine.createSpy('failure()');

            getAnalyticsDeferreds = [];
            putCampaignDeferreds = [];
            putExternalCampaignDeferreds = [];
            spyOn(request, 'get').and.callFake(requestConfig => {
                if (requestConfig.url.indexOf(config.cwrx.api.campaigns.endpoint) > -1) {
                    return (getCampaignsDeferred = q.defer()).promise;
                }

                if (requestConfig.url.indexOf(config.cwrx.api.transactions.endpoint) > -1) {
                    return (getTransactionsDeferred = q.defer()).promise;
                }

                if (requestConfig.url.indexOf(config.cwrx.api.analytics.endpoint) > -1) {
                    return getAnalyticsDeferreds[getAnalyticsDeferreds.push(q.defer()) - 1].promise;
                }

                return q.reject(new Error(`Unknown URL: ${requestConfig.url}`));
            });

            spyOn(request, 'put').and.callFake(requestConfig => {
                if (requestConfig.url.indexOf('/external/beeswax') > -1) {
                    return putExternalCampaignDeferreds[putExternalCampaignDeferreds.push(q.defer()) - 1].promise;
                }

                if (requestConfig.url.indexOf(config.cwrx.api.campaigns.endpoint) > -1) {
                    return putCampaignDeferreds[putCampaignDeferreds.push(q.defer()) - 1].promise;
                }

                return q.reject(new Error(`Unknown URL: ${requestConfig.url}`));
            });

            getBeeswaxCampaignDeferreds = [];
            spyOn(beeswax.campaigns, 'find').and.callFake(() => {
                return getBeeswaxCampaignDeferreds[getBeeswaxCampaignDeferreds.push(q.defer()) - 1].promise;
            });

            editBeeswaxCampaignDeferreds = [];
            spyOn(beeswax.campaigns, 'edit').and.callFake(() => {
                return editBeeswaxCampaignDeferreds[editBeeswaxCampaignDeferreds.push(q.defer()) - 1].promise;
            });

            showcase.rebalance(orgId).then(success, failure);
            setTimeout(done);
        });

        it('should GET the org\'s campaigns', function() {
            expect(request.get).toHaveBeenCalledWith({
                url: resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint),
                qs: {
                    org: orgId,
                    application: 'showcase'
                }
            });
        });

        it('should get the org\'s transactions', function() {
            expect(request.get).toHaveBeenCalledWith({
                url: resolveURL(config.cwrx.api.root, config.cwrx.api.transactions.endpoint),
                qs: {
                    org: orgId,
                    sort: 'cycleEnd,-1'
                }
            });
        });

        describe('if the org has no transaction', function() {
            let campaigns, activeCampaigns, canceledCampaigns, transactions;

            beforeEach(function(done) {
                activeCampaigns = Array.apply([], new Array(5)).map(() => ({
                    id: `cam-${createUuid()}`,
                    status: Status.Active,
                    product: {
                        type: 'app'
                    }
                }));
                canceledCampaigns = Array.apply([], new Array(2)).map(() => ({
                    id: `cam-${createUuid()}`,
                    status: Status.Canceled,
                    product: {
                        type: 'app'
                    }
                }));

                campaigns = [].concat(activeCampaigns, canceledCampaigns);

                transactions = [];

                getCampaignsDeferred.resolve([campaigns, { statusCode: 200 }]);
                getTransactionsDeferred.resolve([transactions, { statusCode: 200 }]);
                setTimeout(done);
            });

            it('should fulfill with the active campaigns', function() {
                expect(success).toHaveBeenCalledWith(activeCampaigns);
            });
        });

        describe('when the campaigns and transactions are fetched', function() {
            let campaigns, activeCampaigns, canceledCampaigns, targetCampaigns, targetCanceledCampaigns, appCampaigns, transactions;

            beforeEach(function(done) {
                targetCampaigns = [
                    {
                        id: 'cam-' + createUuid(),
                        status: Status.Active,
                        application: 'showcase',
                        pricing: {
                            model: 'cpv',
                            cost: 0.020,
                            budget: 50,
                            dailyLimit: 2
                        },
                        externalIds: {
                            beeswax: createUuid()
                        },
                        conversionMultipliers: {
                            internal: 1.25,
                            external: 1.50
                        },
                        product: {
                            type: 'app'
                        },
                        targetUsers: 1000
                    },
                    {
                        id: 'cam-' + createUuid(),
                        status: Status.OutOfBudget,
                        application: 'showcase',
                        pricing: {
                            model: 'cpv',
                            cost: 0.023,
                            budget: 12.5,
                            dailyLimit: 2
                        },
                        externalIds: {
                            beeswax: createUuid()
                        },
                        product: {
                            type: 'app'
                        },
                        targetUsers: 1000
                    },
                    {
                        id: 'cam-' + createUuid(),
                        status: Status.Draft,
                        application: 'showcase',
                        externalCampaigns: {
                            beeswax: {
                                externalId: createUuid()
                            }
                        },
                        product: {
                            type: 'app'
                        }
                    }
                ];

                activeCampaigns = [].concat(
                    [
                        {
                            id: 'cam-' + createUuid(),
                            status: Status.OutOfBudget,
                            application: 'showcase',
                            pricing: {
                                model: 'cpv',
                                cost: 0.01,
                                budget: 0,
                                dailyLimit: 2
                            },
                            externalCampaigns: {
                                beeswax: {
                                    externalId: createUuid(),
                                    budget: 0,
                                    dailyLimit: 1
                                }
                            },
                            product: {
                                type: 'ecommerce'
                            }
                        }
                    ],
                    targetCampaigns,
                    [
                        {
                            id: 'cam-' + createUuid(),
                            status: Status.OutOfBudget,
                            application: 'showcase',
                            pricing: {
                                model: 'cpv',
                                cost: 0.01,
                                budget: 0,
                                dailyLimit: 2
                            },
                            externalCampaigns: {
                                beeswax: {
                                    externalId: createUuid(),
                                    budgetImpressions: 0,
                                    dailyLimitImpressions: 200
                                }
                            },
                            product: {
                                type: 'ecommerce'
                            }
                        }
                    ]
                );
                targetCanceledCampaigns = Array.apply([], new Array(2)).map(() => ({
                    id: `cam-${createUuid()}`,
                    status: Status.Canceled,
                    application: 'showcase',
                    pricing: {
                        model: 'cpv',
                        cost: 0.01,
                        budget: 0,
                        dailyLimit: 2
                    },
                    externalCampaigns: {
                        beeswax: {
                            externalId: createUuid(),
                            budget: 0,
                            dailyLimit: 1
                        }
                    },
                    product: {
                        type: 'app'
                    }
                }));
                canceledCampaigns = [].concat(
                    Array.apply([], new Array(2)).map(() => ({
                        id: `cam-${createUuid()}`,
                        status: Status.Canceled,
                        application: 'showcase',
                        pricing: {
                            model: 'cpv',
                            cost: 0.01,
                            budget: 0,
                            dailyLimit: 2
                        },
                        externalCampaigns: {
                            beeswax: {
                                externalId: createUuid(),
                                budget: 0,
                                dailyLimit: 1
                            }
                        },
                        product: {
                            type: 'ecommerce'
                        }
                    })),
                    targetCanceledCampaigns
                );
                campaigns = [].concat(activeCampaigns, canceledCampaigns);
                appCampaigns = [].concat(targetCampaigns, targetCanceledCampaigns);

                transactions = [
                    {
                        id: `t-${createUuid()}`,
                        application: 'showcase',
                        paymentPlanId: `pp-${createUuid()}`,
                        targetUsers: 500,
                        cycleEnd: null,
                        amount: 10
                    },
                    {
                        id: `t-${createUuid()}`,
                        application: 'selfie',
                        paymentPlanId: `pp-${createUuid()}`,
                        targetUsers: 750,
                        cycleEnd: moment().add(5, 'days').format(),
                        amount: 15
                    },
                    {
                        id: `t-${createUuid()}`,
                        application: 'showcase',
                        paymentPlanId: null,
                        targetUsers: 750,
                        cycleEnd: moment().add(5, 'days').format(),
                        amount: 15
                    },
                    {
                        id: `t-${createUuid()}`,
                        application: 'showcase',
                        paymentPlanId: `pp-${createUuid()}`,
                        targetUsers: 2000,
                        cycleEnd: moment().add(5, 'days').format(),
                        amount: 50
                    },
                    {
                        id: `t-${createUuid()}`,
                        application: 'showcase',
                        paymentPlanId: `pp-${createUuid()}`,
                        targetUsers: 1000,
                        cycleEnd: moment().subtract(5, 'days').format(),
                        amount: 25
                    }
                ];

                request.get.calls.reset();

                getCampaignsDeferred.resolve([campaigns, { statusCode: 200 }]);
                getTransactionsDeferred.resolve([transactions, { statusCode: 200 }]);

                setTimeout(done);
            });

            it('should get analytics for the campaigns', function() {
                appCampaigns.forEach(campaign => expect(request.get).toHaveBeenCalledWith({
                    url: resolveURL(config.cwrx.api.root, `${config.cwrx.api.analytics.endpoint}/campaigns/showcase/apps/${campaign.id}`)
                }));
                expect(request.get.calls.count()).toBe(appCampaigns.length);
            });

            it('should get the beeswax campaigns', function() {
                expect(beeswax.campaigns.find.calls.count()).toBe(targetCampaigns.length);
                targetCampaigns.forEach(campaign => expect(beeswax.campaigns.find).toHaveBeenCalledWith(
                    _.get(campaign, 'externalIds.beeswax') || _.get(campaign, 'externalCampaigns.beeswax.externalId')
                ));
            });

            describe('when the analytics and beeswax campaigns are fetched', function() {
                let analytics, beeswaxCampaigns;

                beforeEach(function(done) {
                    analytics = [
                        {
                            campaignId: targetCampaigns[0].id,
                            cycle: {
                                users: 500
                            }
                        },
                        {
                            campaignId: targetCampaigns[1].id,
                            cycle: {
                                users: 500
                            }
                        },
                        {
                            campaignId: targetCampaigns[2].id,
                            cycle: {
                                users: 0
                            }
                        }
                    ];

                    beeswaxCampaigns = [
                        {
                            campaign_id: targetCampaigns[0].externalIds.beeswax,
                            campaign_budget: 2000
                        },
                        {
                            campaign_id: targetCampaigns[1].externalIds.beeswax,
                            campaign_budget: 500
                        },
                        {
                            campaign_id: targetCampaigns[2].externalCampaigns.beeswax.externalId,
                            campaign_budget: 0
                        }
                    ];

                    getAnalyticsDeferreds.forEach((deferred, index) => deferred.resolve([
                        analytics[index],
                        { statusCode: 200 }
                    ]));

                    getBeeswaxCampaignDeferreds.forEach((deferred, index) => deferred.resolve({
                        success: true,
                        payload: beeswaxCampaigns[index]
                    }));

                    setTimeout(done);
                });

                it('should update each campaign', function() {
                    expect(request.put).toHaveBeenCalledWith({
                        url: resolveURL(config.cwrx.api.root, `${config.cwrx.api.campaigns.endpoint}/${targetCampaigns[0].id}`),
                        json: {
                            targetUsers: 833,
                            pricing: _.assign({}, targetCampaigns[0].pricing, {
                                model: 'cpv',
                                cost: 0.020,
                                budget: 45.83
                            })
                        }
                    });

                    expect(request.put).toHaveBeenCalledWith({
                        url: resolveURL(config.cwrx.api.root, `${config.cwrx.api.campaigns.endpoint}/${targetCampaigns[1].id}`),
                        json: {
                            targetUsers: 833,
                            pricing: _.assign({}, targetCampaigns[1].pricing, {
                                model: 'cpv',
                                cost: 0.023,
                                budget: 8.33
                            })
                        }
                    });

                    expect(request.put).toHaveBeenCalledWith({
                        url: resolveURL(config.cwrx.api.root, `${config.cwrx.api.campaigns.endpoint}/${targetCampaigns[2].id}`),
                        json: {
                            targetUsers: 333,
                            pricing: _.assign({}, targetCampaigns[2].pricing, {
                                model: 'cpv',
                                cost: 0.023,
                                budget: 8.33
                            })
                        }
                    });

                    expect(request.put.calls.count()).toBe(targetCampaigns.length, 'Incorrect number of PUTs.');
                });

                describe('when the campaigns are updated', function() {
                    let updatedCampaigns;

                    beforeEach(function(done) {
                        updatedCampaigns = targetCampaigns.map((campaign, index) => _.assign({}, campaign, request.put.calls.all()[index].args[0].json));
                        putCampaignDeferreds.forEach((deferred, index) => deferred.resolve([updatedCampaigns[index], { statusCode: 200 }]));

                        request.put.calls.reset();

                        setTimeout(done);
                    });

                    it('should update the external campaigns', function() {
                        expect(beeswax.campaigns.edit).toHaveBeenCalledWith(beeswaxCampaigns[0].campaign_id, {
                            campaign_budget: 1750
                        });

                        expect(beeswax.campaigns.edit).toHaveBeenCalledWith(beeswaxCampaigns[1].campaign_id, {
                            campaign_budget: 291
                        });

                        expect(beeswax.campaigns.edit).toHaveBeenCalledWith(beeswaxCampaigns[2].campaign_id, {
                            campaign_budget: 416
                        });

                        expect(beeswax.campaigns.edit.calls.count()).toBe(targetCampaigns.length, 'Incorrect number of edits.');
                    });

                    describe('when the external campaigns are updated', function() {
                        beforeEach(function(done) {
                            editBeeswaxCampaignDeferreds.forEach((deferred, index) => deferred.resolve({
                                success: true,
                                payload: _.assign(
                                    {},
                                    beeswaxCampaigns[index],
                                    beeswax.campaigns.edit.calls.all()[index].args[1]
                                )
                            }));

                            setTimeout(done);
                        });

                        it('should fulfill with the campaigns', function() {
                            expect(success).toHaveBeenCalledWith(updatedCampaigns);
                        });
                    });
                });
            });
        });
    });
});
