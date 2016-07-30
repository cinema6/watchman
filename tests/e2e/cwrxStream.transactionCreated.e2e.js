'use strict';

var Configurator = require('../helpers/Configurator.js');
var JsonProducer = require('rc-kinesis').JsonProducer;
var q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils');
var ld = require('lodash');
var CwrxRequest = require('../../lib/CwrxRequest');
var resolveURL = require('url').resolve;
var uuid = require('rc-uuid');
var moment = require('moment');
var Status = require('cwrx/lib/enums').Status;
var BeeswaxHelper = require('../helpers/BeeswaxHelper');

var API_ROOT = process.env.apiRoot;
var APP_CREDS = JSON.parse(process.env.appCreds);
var AWS_CREDS = JSON.parse(process.env.awsCreds);
var CWRX_STREAM = process.env.cwrxStream;
var PREFIX = process.env.appPrefix;

function createId(prefix) {
    return prefix + '-' + uuid.createUuid();
}

function waitUntil(predicate) {
    function check() {
        return q(predicate()).then(function(value) {
            if (value) {
                return value;
            } else {
                return q.delay(500).then(check);
            }
        });
    }

    return check();
}

fdescribe('cwrxStream transactionCreated', function() {
    var producer, request, beeswax;
    var advertiser, campaigns, beeswaxCampaigns, beeswaxCreative, 
        targetCampaignIds, otherCampaignIds, ourCampaignIds;
    var targetOrg, transaction;

    function api(endpoint) {
        return resolveURL(API_ROOT, endpoint);
    }

    function createAdvertiser() {
        return request.post({
            url: api('/api/account/advertisers'),
            json: {
                name: 'e2e-advertiser--' + uuid.createUuid(),
                defaultLinks: {},
                defaultLogos: {}
            }
        }).then(ld.property(0));
    }

    function setupCampaign(campaign) {
        return beeswax.api.campaigns.create({
            advertiser_id: advertiser.beeswaxIds.advertiser,
            campaign_name: `E2E Test Campaign (${uuid.createUuid()})`,
            campaign_budget: 750,
            budget_type: 1,
            start_date: moment().format('YYYY-MM-DD'),
            pacing: 0,
            active: true
        }).then(response => {
            const beeswaxCampaign = response.payload;

            return request.put({
                url: api('/api/campaigns/' + campaign.id),
                json: {
                    externalIds: {
                        beeswax: response.payload.campaign_id
                    }
                }
            }).spread(campaign => [campaign, beeswaxCampaign]);
        });
    }

    function transactionCreatedEvent(time) {
        return producer.produce({
            type: 'transactionCreated',
            data: {
                transaction: transaction,
                date: (time || moment()).format()
            }
        });
    }

    // This beforeAll is dedicated to setting application config
    beforeAll(function(done) {
        const configurator = new Configurator();
        const sharedConfig = {
            secrets: '/opt/sixxy/.watchman.secrets.json',
            appCreds: '/opt/sixxy/.rcAppCreds.json',
            beeswax : {
                bid : { bidding_strategy: 'CPM', values: { cpm_bid: 10 } }
            },
            cwrx: {
                api: {
                    root: API_ROOT,
                    tracking : 'https://audit.cinema6.com/pixel.gif',
                    campaigns: {
                        endpoint: '/api/campaigns'
                    },
                    placements: {
                        endpoint: '/api/placements'
                    },
                    advertisers: {
                        endpoint: '/api/account/advertisers'
                    }
                }
            },
            campaign: {
                conversionMultipliers: {
                    internal: 1.1,
                    external: 1.25
                }
            },
            emails: {
                sender: 'support@cinema6.com'
            },
            postmark: {
                templates: {
                }
            }
        };
        const cwrxConfig = {
            eventHandlers: {
                transactionCreated: {
                    actions: [
                        {
                            name: 'showcase/apps/auto_increase_budget',
                            options: {
                                dailyLimit: 2,
                                externalAllocationFactor: 0.5
                            },
                            ifData: {
                                'transaction.sign': '^1$',
                                'transaction.application': '^showcase$'
                            }
                        }
                    ]
                }
            }
        };
        const timeConfig = {
            eventHandlers: { }
        };
        const watchmanConfig = {
            eventHandlers: { }
        };
        Promise.all([
            configurator.updateConfig(`${PREFIX}CwrxStreamApplication`, sharedConfig, cwrxConfig),
            configurator.updateConfig(`${PREFIX}TimeStreamApplication`, sharedConfig, timeConfig),
            configurator.updateConfig(`${PREFIX}WatchmanStreamApplication`, sharedConfig, watchmanConfig)
        ]).then(done, done.fail);
    });

    beforeAll(function() {
        var awsConfig = ld.assign({ region: 'us-east-1' }, AWS_CREDS || {});

        jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

        producer = new JsonProducer(CWRX_STREAM, awsConfig);
        request = new CwrxRequest(APP_CREDS);
        beeswax = new BeeswaxHelper();
    });

    beforeAll(function(done) {
        var cwrxApp = {
            id: 'app-cwrx',
            created: new Date(),
            lastUpdated: new Date(),
            status: 'active',
            key: 'cwrx-services',
            secret: 'ade2cfd7ec2e71d54064fb8cfb1cc92be1d01ffd',
            permissions: {
                orgs: { create: 'all' },
                advertisers: { create: 'all' },
                transactions: { create: 'all' }
            },
            fieldValidation: {
                advertisers: {
                    org: { __allowed: true }
                },
                orgs: {
                    referralCode: { __allowed: true },
                    paymentPlanId: { __allowed: true }
                }
            },
            entitlements: {
                directEditCampaigns: true
            }
        };
        var watchmanApp = {
            id: createId('app'),
            key: APP_CREDS.key,
            status: 'active',
            secret: APP_CREDS.secret,
            permissions: {
                campaigns: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                cards: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                users: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                orgs: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                advertisers: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                promotions: { read: 'all' },
                transactions: { create: 'all' }
            },
            entitlements: {
                directEditCampaigns: true,
                makePaymentForAny: true
            },
            fieldValidation: {
                campaigns: {
                    status: {
                        __allowed: true
                    },
                    pricing: {
                        budget: {
                            __min: 0,
                            __max: Infinity
                        },
                        cost: {
                            __allowed: true
                        },
                        dailyLimit: {
                            __min: 0,
                            __max: Infinity
                        }
                    }
                },
                orgs: {
                    paymentPlanStart: { __allowed: true },
                    paymentPlanId: { __allowed: true },
                    promotions: { __allowed: true }
                }
            }
        };
        q.all([
            testUtils.resetCollection('applications', [watchmanApp, cwrxApp])
        ]).then(function() {
            return createAdvertiser();
        }).then(function(/*advertiser*/) {
            advertiser = arguments[0];
            targetOrg = createId('o');

            targetCampaignIds = [createId('cam'), createId('cam')];
            campaigns = [
                // Another org's selfie campaign
                {
                    id: createId('cam'),
                    application: 'selfie',
                    status: Status.Paused,
                    created: moment().subtract(1, 'year').toDate(),
                    lastUpdated: moment().subtract(1, 'month').toDate(),
                    pricing: {
                        model: 'cpv',
                        cost: 0.06,
                        budget: 250,
                        dailyLimit: 50
                    },
                    org: createId('o'),
                    advertiserId: advertiser.id
                },
                // Another org's showcase campaign
                {
                    id: createId('cam'),
                    status: Status.Active,
                    application: 'showcase',
                    created: moment().subtract(1, 'year').toDate(),
                    lastUpdated: moment().subtract(1, 'month').toDate(),
                    pricing: {
                        model: 'cpv',
                        cost: 0.01,
                        budget: 33,
                        dailyLimit: 2
                    },
                    org: createId('o'),
                    advertiserId: advertiser.id,
                    product: {
                        type: 'app'
                    }
                },
                // Our org's showcase campaign
                {
                    id: targetCampaignIds[0],
                    status: Status.OutOfBudget,
                    application: 'showcase',
                    created: moment().subtract(1, 'year').toDate(),
                    lastUpdated: moment().subtract(1, 'month').toDate(),
                    pricing: {
                        model: 'cpv',
                        cost: 0.01,
                        budget: 3.50,
                        dailyLimit: 2
                    },
                    org: targetOrg,
                    advertiserId: advertiser.id,
                    product: {
                        type: 'app'
                    },
                    conversionMultipliers: {
                        internal: 1.5,
                        external: 2
                    }
                },
                // Another org's selfie campaign
                {
                    id: createId('cam'),
                    status: Status.Rejected,
                    application: 'selfie',
                    created: moment().subtract(1, 'year').toDate(),
                    lastUpdated: moment().subtract(1, 'month').toDate(),
                    pricing: {
                        model: 'cpv',
                        cost: 0.06,
                        budget: 1000,
                        dailyLimit: 100
                    },
                    org: createId('o'),
                    advertiserId: advertiser.id
                },
                // Our org's showcase campaign
                {
                    id: targetCampaignIds[1],
                    status: Status.OutOfBudget,
                    application: 'showcase',
                    created: moment().subtract(1, 'year').toDate(),
                    lastUpdated: moment().subtract(1, 'month').toDate(),
                    pricing: {
                        model: 'cpv',
                        cost: 0.01,
                        budget: 1.25,
                        dailyLimit: 1
                    },
                    org: targetOrg,
                    advertiserId: advertiser.id,
                    product: {
                        type: 'app'
                    }
                },
                // Our org's showcase (non-app) campaign
                {
                    id: createId('cam'),
                    status: Status.Active,
                    application: 'showcase',
                    created: moment().subtract(1, 'year').toDate(),
                    lastUpdated: moment().subtract(1, 'month').toDate(),
                    pricing: {
                        model: 'cpv',
                        cost: 0.01,
                        budget: 1.25,
                        dailyLimit: 1
                    },
                    org: targetOrg,
                    advertiserId: advertiser.id,
                    product: {
                        type: 'ecommerce'
                    }
                }
            ].map(function(campaign) {
                return ld.assign({}, campaign, {
                    name: 'My Awesome Campaign (' + uuid.createUuid() + ')'
                });
            });
            otherCampaignIds = campaigns.map(function(campaign) { return campaign.id; })
                .filter(function(id) { return targetCampaignIds.indexOf(id) < 0; });
            ourCampaignIds = campaigns.filter(function(campaign) {
                return campaign.org === targetOrg;
            }).map(function(campaign) {
                return campaign.id;
            });

            return testUtils.resetCollection('campaigns', campaigns);
        }).then(function() {
            return q.all(campaigns.map(function(campaign) {
                return setupCampaign(campaign);
            }));
        }).then(function(campaignSets) {
            campaigns = campaignSets.map(set => set[0]);
            beeswaxCampaigns = campaignSets.map(set => set[1]);

            campaigns = campaigns.map(function(campaign) {
                var isOurs = ourCampaignIds.indexOf(campaign.id) > -1;

                return ld.assign({}, campaign, {
                    created: moment().subtract(1, 'year').toDate(),
                    lastUpdated: moment().subtract(1, 'month').toDate(),
                    org: isOurs ? targetOrg : campaign.org
                });
            });

            return testUtils.resetCollection('campaigns', campaigns);
        }).then(function(){
            return beeswax.createAdvertiserMRAIDCreative(advertiser.beeswaxIds.advertiser)
                .then(function(c){ beeswaxCreative = c; });
        }).then(done, done.fail);
    });

    afterAll(function(done) {
        beeswax.cleanupAdvertiser(advertiser.beeswaxIds.advertiser).then(done, done.fail);
    });

    describe('when produced', function() {
        var updatedCampaigns, updatedBeeswaxCampaigns, updatedBeeswaxLineItems;

        beforeAll(function(done) {
            transaction = {
                id: createId('t'),
                created: new Date().toISOString(),
                transactionTS: new Date().toISOString(),
                amount: 50,
                sign: 1,
                units: 1,
                org: targetOrg,
                campaign: null,
                braintreeId: null,
                promotion: createId('pro'),
                application: 'showcase',
                paymentPlanId: 'pp-0Ek5Na02vCohpPgw',
                targetUsers: 2000,
                cycleStart: moment().format(),
                cycleEnd: moment().add(1, 'month').subtract(1, 'day').format()
            };

            transactionCreatedEvent().then(function() {
                return waitUntil(() => Promise.all([
                        Promise.all(targetCampaignIds.map(id => (
                            request.get({
                                url: api('/api/campaigns/' + id),
                                json: true
                            }).spread(campaign => (
                                (
                                    moment(campaign.lastUpdated).isAfter(
                                        moment().subtract(1, 'day'))
                                ) && campaign
                            ))
                        )))
                        .then(campaigns => 
                            campaigns.every(campaign => !!campaign) && campaigns
                        ),
                        Promise.all(targetCampaignIds.map(id => {
                            const campaign = ld.find(campaigns, { id });

                            return beeswax.api.campaigns.find(campaign.externalIds.beeswax)
                                .then(response => {
                                    const beeswaxCampaign = response.payload;
                                    const oldBeeswaxCampaign = ld.find(
                                        beeswaxCampaigns, 
                                        { campaign_id: beeswaxCampaign.campaign_id }
                                    );

                                    return (
                                        beeswaxCampaign.campaign_budget !==
                                            oldBeeswaxCampaign.campaign_budget
                                    ) && beeswaxCampaign;
                                });
                        }))
                        .then(beeswaxCampaigns => 
                            beeswaxCampaigns.every(beeswaxCampaign => !!beeswaxCampaign)
                                && beeswaxCampaigns
                        ),
                        Promise.all(targetCampaignIds.map(id => {
                            const campaign = ld.find(campaigns, { id });

                            return beeswax.api.lineItems.query({
                                    campaign_id : campaign.externalIds.beeswax
                                })
                                .then(response => {
                                    return response.payload;
                                });
                        }))
                        .then(beeswaxLineItems => 
                            beeswaxLineItems.every(item => (!!item && item.length)) &&
                                beeswaxLineItems
                        )
                    ])
                    .then(items => items.every(item => !!item) && items)
                ).spread(function(/*updatedCampaigns, updatedBeeswaxCampaigns*/) {
                    updatedCampaigns = arguments[0];
                    updatedBeeswaxCampaigns = arguments[1];
                    updatedBeeswaxLineItems = arguments[2];
                });
            }).then(done, done.fail);
        });

        it('should update each showcase campaign for the org', function() {
            expect(updatedCampaigns.length).toBe(targetCampaignIds.length);
            updatedCampaigns.forEach(function(campaign) {
                expect(moment(campaign.lastUpdated).isBefore(moment().subtract(1, 'week'))).toBe(false, 'campaign(' + campaign.id + ') was not updated recently!');
            });
        });

        it('should set the pricing hash of every showcase campaign', function() {
            expect(updatedCampaigns[0].pricing).toEqual({
                model: 'cpv',
                cost: 0.017,
                budget: 28.5,
                dailyLimit: 2
            });

            expect(updatedCampaigns[1].pricing).toEqual({
                model: 'cpv',
                cost: 0.023,
                budget: 26.25,
                dailyLimit: 2
            });
        });

        it('should set each campaign\'s dailyLimit', function() {
            updatedCampaigns.forEach(function(campaign) {
                expect(campaign.pricing.dailyLimit).toBe(2);
            });
        });

        it('should increase the impressions of every beeswax campaign', function() {
            expect(updatedBeeswaxCampaigns[0].campaign_budget).toBe(2750);
            expect(updatedBeeswaxCampaigns[1].campaign_budget).toBe(2000);

            expect(updatedBeeswaxLineItems[0][0].line_item_budget).toBe(2000);
            expect(updatedBeeswaxLineItems[1][0].line_item_budget).toBe(1250);
        });

        it('should set every showcase campaign\'s status to active', function() {
            updatedCampaigns.forEach(function(campaign) {
                expect(campaign.status).toBe(Status.Active);
            });
        });

        it('should not update any other campaigns', function(done) {
            q.all(otherCampaignIds.map(function(id) {
                return request.get({
                    url: api('/api/campaigns/' + id),
                    json: true
                }).spread(function(campaign) {
                    expect(moment(campaign.lastUpdated).isBefore(moment().subtract(1, 'week'))).toBe(true, 'campaign(' + campaign.id + ') was updated recently!');
                });
            })).then(done, done.fail);
        });
    });
});
