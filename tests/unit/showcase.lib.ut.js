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
    let CwrxRequest, BeeswaxMiddleware;
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

        BeeswaxMiddleware = jasmine.createSpy('BeeswaxMiddleware()').and.callFake(() => ({
            adjustCampaignBudget: () => null,
            upsertCampaignActiveLineItems: () => null
        }));

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
                    },
                    orgs: {
                        endpoint: '/api/account/orgs'
                    },
                    paymentPlans: {
                        endpoint: '/api/payment-plans'
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
            './BeeswaxMiddleware': BeeswaxMiddleware
        })(config);

        request = CwrxRequest.calls.mostRecent().returnValue;
        beeswax = BeeswaxMiddleware.calls.mostRecent().returnValue;
    });

    it('should exist', function() {
        expect(showcase).toEqual(jasmine.any(Object));
    });

    it('should create a CwrxRequest', function() {
        expect(CwrxRequest).toHaveBeenCalledWith(config.appCreds);
    });

    it('should create a BeeswaxMiddleware', function() {
        expect(BeeswaxMiddleware).toHaveBeenCalledWith(
            {
                apiRoot: config.beeswax.apiRoot,
                creds  : config.state.secrets.beeswax,
                bid : undefined,
                templates: undefined
            },
            {
                creds: config.appCreds,
                api: config.cwrx.api
            },
            {
                conversionMultipliers : {
                    internal : 1.1, external : 1.25
                }
            }
        );
    });


    describe('rebalance(orgId)', function() {
        let orgId;
        let success, failure;
        let getCampaignsDeferred, getTransactionsDeferred, getAnalyticsDeferreds, putExternalCampaignDeferreds;
        let putCampaignDeferreds;
        let adjustBeeswaxCampaignBudgetDeferreds, upsertBeeswaxLineItemsDeferreds;

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

            adjustBeeswaxCampaignBudgetDeferreds = [];
            spyOn(beeswax, 'adjustCampaignBudget').and.callFake(() => {
                return adjustBeeswaxCampaignBudgetDeferreds[
                    adjustBeeswaxCampaignBudgetDeferreds.push(q.defer()) - 1].promise;
            });

            upsertBeeswaxLineItemsDeferreds = [];
            spyOn(beeswax, 'upsertCampaignActiveLineItems').and.callFake(() => {
                return upsertBeeswaxLineItemsDeferreds[
                    upsertBeeswaxLineItemsDeferreds.push(q.defer()) - 1].promise;
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

        it('should get the org\'s current payment transaction', function() {
            expect(request.get).toHaveBeenCalledWith({
                url: resolveURL(config.cwrx.api.root,
                        `${config.cwrx.api.transactions.endpoint}/showcase/current-payment`),
                qs: {
                    org: orgId
                }
            });
        });

        describe('if the org has no transaction', function() {
            let campaigns, activeCampaigns, canceledCampaigns ;

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

                getCampaignsDeferred.resolve([campaigns, { statusCode: 200 }]);
                getTransactionsDeferred.reject(
                    new Error('404 - Unable to locate currentPayment.'));

                setTimeout(done);
            });

            it('should fulfill with the active campaigns', function() {
                expect(success).toHaveBeenCalledWith(activeCampaigns);
            });
        });

        describe('when the campaigns and transactions are fetched', function() {
            let campaigns, activeCampaigns, canceledCampaigns, targetCampaigns, targetCanceledCampaigns, appCampaigns, transaction;

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
                transaction = {
                    application: 'showcase',
                    transactionId: 't-123',
                    transactionTimestamp: new Date().toISOString(),
                    orgId: orgId,
                    amount: 50,
                    braintreeId: 'abc123',
                    promotionId: null,
                    paymentPlanId: 'p-1234',
                    cycleStart: moment().subtract(5, 'days').format(),
                    cycleEnd: moment().add(5, 'days').format(),
                    planViews: 2000,
                    bonusViews : 0,
                    totalViews : 2000
                };

                request.get.calls.reset();

                getCampaignsDeferred.resolve([campaigns, { statusCode: 200 }]);
                getTransactionsDeferred.resolve([transaction, { statusCode: 200 }]);

                setTimeout(done);
            });

            it('should get analytics for the campaigns', function() {
                appCampaigns.forEach(campaign => expect(request.get).toHaveBeenCalledWith({
                    url: resolveURL(config.cwrx.api.root, `${config.cwrx.api.analytics.endpoint}/campaigns/showcase/apps/${campaign.id}`)
                }));
                expect(request.get.calls.count()).toBe(appCampaigns.length);
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
                        [
                            {
                                campaign_id: targetCampaigns[0].externalIds.beeswax,
                                campaign_budget: 2000
                            },
                            {
                                campaign_id: targetCampaigns[0].externalIds.beeswax,
                                campaign_budget: 1750
                            }
                        ],
                        [
                            {
                                campaign_id: targetCampaigns[1].externalIds.beeswax,
                                campaign_budget: 500
                            },
                            {
                                campaign_id: targetCampaigns[1].externalIds.beeswax,
                                campaign_budget: 291
                            }
                        ],
                        [
                            {
                                campaign_id: targetCampaigns[2].externalCampaigns.beeswax.externalId,
                                campaign_budget: 0
                            },
                            {
                                campaign_id: targetCampaigns[2].externalCampaigns.beeswax.externalId,
                                campaign_budget: 416
                            }
                        ]
                    ];

                    getAnalyticsDeferreds.forEach((deferred, index) => deferred.resolve([
                        analytics[index],
                        { statusCode: 200 }
                    ]));

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

                    it('should update the external campaign budgets', function() {
                        expect(beeswax.adjustCampaignBudget)
                            .toHaveBeenCalledWith(updatedCampaigns[0], -250 );

                        expect(beeswax.adjustCampaignBudget)
                            .toHaveBeenCalledWith(updatedCampaigns[1], -209 );

                        expect(beeswax.adjustCampaignBudget)
                            .toHaveBeenCalledWith(updatedCampaigns[2], 416 );

                        expect(beeswax.adjustCampaignBudget.calls.count())
                            .toBe(targetCampaigns.length, 'Incorrect number of edits.');
                    });

                    describe('when the external campaigns are updated', function() {
                        beforeEach(function(done) {
                            adjustBeeswaxCampaignBudgetDeferreds.forEach((deferred, index) =>
                                deferred.resolve(beeswaxCampaigns[index]));

                            setTimeout(done);
                        });

                        it('should upsert the external line items', function() {
                            expect(beeswax.upsertCampaignActiveLineItems)
                                .toHaveBeenCalledWith({
                                    campaign : updatedCampaigns[0],
                                    startDate : transaction.cycleStart,
                                    endDate : transaction.cycleEnd
                                });

                            expect(beeswax.upsertCampaignActiveLineItems)
                                .toHaveBeenCalledWith({
                                    campaign : updatedCampaigns[1],
                                    startDate : transaction.cycleStart,
                                    endDate : transaction.cycleEnd
                                });

                            expect(beeswax.upsertCampaignActiveLineItems)
                                .toHaveBeenCalledWith({
                                    campaign : updatedCampaigns[2],
                                    startDate : transaction.cycleStart,
                                    endDate : transaction.cycleEnd
                                });

                            expect(beeswax.upsertCampaignActiveLineItems.calls.count())
                                .toBe(targetCampaigns.length, 'Incorrect number of upserts.');
                        });

                        describe('when the external line items are upserted.',function(){
                            beforeEach(function(done){
                                upsertBeeswaxLineItemsDeferreds.forEach( deferred  => {
                                    deferred.fulfill({
                                        createdLineItems : [ ],
                                        updatedLineItems : [ ]
                                    });
                                });

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

    describe('method: checkWithinCampaignLimit', function () {
        beforeEach(function () {
            spyOn(request, 'get');
            this.mockOrg = {
                id: 'o-1234567',
                paymentPlanId: 'pp-1234567',
                status: 'active'
            };
            this.mockPaymentPlan = {
                id: 'pp-1234567',
                maxCampaigns: 10,
                label: 'The Best Payment Plan',
                status: 'active'
            };
            this.orgResponse = null;
            this.paymentPlanResponse = null;
            this.campaignResponse = null;
            request.get.and.callFake(options => {
                const url = options.url;

                if (/orgs/.test(url)) {
                    return this.orgResponse;
                }

                if (/payment-plans/.test(url)) {
                    return this.paymentPlanResponse;
                }

                if (/campaigns/.test(url)) {
                    return this.campaignResponse;
                }
            });
        });

        it('should fetch the org of the campaign', function (done) {
            this.orgResponse = Promise.resolve([this.mockOrg]);
            this.paymentPlanResponse = Promise.resolve([this.mockPaymentPlan]);
            this.campaignResponse = Promise.resolve([[]]);
            showcase.checkWithinCampaignLimit(this.mockOrg.id).then(() => {
                expect(request.get).toHaveBeenCalledWith({
                    url: 'http://33.33.33.10/api/account/orgs/o-1234567'
                });
            }).then(done, done.fail);
        });

        it('should reject if fetching the org fails', function (done) {
            this.orgResponse = Promise.reject(new Error('epic fail'));
            this.paymentPlanResponse = Promise.resolve([this.mockPaymentPlan]);
            this.campaignResponse = Promise.resolve([[]]);
            showcase.checkWithinCampaignLimit(this.mockOrg.id).then(done.fail, error => {
                expect(error).toEqual(jasmine.any(Error));
                expect(error.message).toBe('epic fail');
            }).then(done, done.fail);
        });

        it('should fetch the payment plan of the org', function (done) {
            this.orgResponse = Promise.resolve([this.mockOrg]);
            this.paymentPlanResponse = Promise.resolve([this.mockPaymentPlan]);
            this.campaignResponse = Promise.resolve([[]]);
            showcase.checkWithinCampaignLimit(this.mockOrg.id).then(() => {
                expect(request.get).toHaveBeenCalledWith({
                    url: 'http://33.33.33.10/api/payment-plans/pp-1234567'
                });
            }).then(done, done.fail);
        });

        it('should reject if fetching the payment plan fails', function (done) {
            this.orgResponse = Promise.resolve([this.mockOrg]);
            this.paymentPlanResponse = Promise.reject(new Error('epic fail'));
            this.campaignResponse = Promise.resolve([[]]);
            showcase.checkWithinCampaignLimit(this.mockOrg.id).then(done.fail, error => {
                expect(error).toEqual(jasmine.any(Error));
                expect(error.message).toBe('epic fail');
            }).then(done, done.fail);
        });

        it('should fetch the number of active campaigns in the org', function (done) {
            this.orgResponse = Promise.resolve([this.mockOrg]);
            this.paymentPlanResponse = Promise.resolve([this.mockPaymentPlan]);
            this.campaignResponse = Promise.resolve([[]]);
            showcase.checkWithinCampaignLimit(this.mockOrg.id).then(() => {
                expect(request.get).toHaveBeenCalledWith({
                    url: 'http://33.33.33.10/api/campaigns',
                    qs: {
                        application: 'showcase',
                        org: 'o-1234567',
                        statuses: 'draft,new,pending,approved,rejected,active,paused,inactive,expired,outOfBudget,error'
                    }
                });
            }).then(done, done.fail);
        });

        it('should reject if fetching the campaigns fails', function (done) {
            this.orgResponse = Promise.resolve([this.mockOrg]);
            this.paymentPlanResponse = Promise.resolve([this.mockPaymentPlan]);
            this.campaignResponse = Promise.reject(new Error('epic fail'));
            showcase.checkWithinCampaignLimit(this.mockOrg.id).then(done.fail, error => {
                expect(error).toEqual(jasmine.any(Error));
                expect(error.message).toBe('epic fail');
            }).then(done, done.fail);
        });

        it('should resolve if the org is within their campaigns limit', function (done) {
            const campaigns = new Array(10).fill({
                name: 'This is a campaign'
            });
            this.orgResponse = Promise.resolve([this.mockOrg]);
            this.paymentPlanResponse = Promise.resolve([this.mockPaymentPlan]);
            this.campaignResponse = Promise.resolve([campaigns]);
            showcase.checkWithinCampaignLimit(this.mockOrg.id).then(done, done.fail);
        });

        it('should reject if the org has exceeded their maximum number of campaigns', function (done) {
            const campaigns = new Array(11).fill({
                name: 'This is a campaign'
            });
            this.orgResponse = Promise.resolve([this.mockOrg]);
            this.paymentPlanResponse = Promise.resolve([this.mockPaymentPlan]);
            this.campaignResponse = Promise.resolve([campaigns]);
            showcase.checkWithinCampaignLimit(this.mockOrg.id).then(done.fail, error => {
                expect(error).toEqual(jasmine.any(Error));
                expect(error.message).toBe('Campaign limit has been reached');
            }).then(done, done.fail);
        });
    });
});
